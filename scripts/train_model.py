import os
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, models, transforms
from torch.utils.data import DataLoader, Subset
from torch.amp import GradScaler
import time
import copy
import torch.backends.cudnn as cudnn
from tqdm import tqdm
import numpy as np

os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"

# --- Configuration for RTX 5070 / Ryzen 9 8940HX ---
IMG_SIZE = 260
BATCH_SIZE = 64       # RTX 5070 8GB can handle 64 with AMP
EPOCHS = 25           # Proper convergence (was 5 — way too few)
LEARNING_RATE = 1e-3  # Higher initial LR with OneCycleLR scheduler
WEIGHT_DECAY = 1e-4
VAL_SPLIT = 0.15      # 85/15 train/val

# Paths (run from scripts/ directory)
# Use unified multi-dataset if available, fallback to PlantVillage
DATASET_DIR = './dataset_unified' if os.path.exists('./dataset_unified') else './PlantVillage_HF'
OUTPUT_DIR = '../public/models'
MODEL_PATH = os.path.join(OUTPUT_DIR, 'plant_disease_model.onnx')
PT_MODEL_PATH = os.path.join(OUTPUT_DIR, 'kropscan_production_model.pth')
CONFIG_PATH = os.path.join(OUTPUT_DIR, 'model_info.json')


class FilteredImageFolder(torch.utils.data.Dataset):
    """ImageFolder subset with remapped labels and custom transform."""
    def __init__(self, samples, old_to_new, transform=None):
        self.samples = samples
        self.old_to_new = old_to_new
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, old_label = self.samples[idx]
        from PIL import Image
        img = Image.open(path).convert('RGB')
        if self.transform:
            img = self.transform(img)
        return img, self.old_to_new[old_label]


def train():
    if not os.path.exists(DATASET_DIR):
        print(f"Dataset not found at {DATASET_DIR}")
        print("Run from the scripts/ directory: cd scripts && python train_model.py")
        return

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == 'cuda':
        cudnn.benchmark = True
    workers = 4  # Safe for Windows

    print("=" * 60)
    print("KROPSCAN MODEL TRAINING v2.0")
    print("=" * 60)
    print(f"Device: {device}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print(f"Epochs: {EPOCHS} | Batch: {BATCH_SIZE} | LR: {LEARNING_RATE}")
    print()

    # --- Transforms ---
    train_transforms = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.RandAugment(num_ops=2, magnitude=9),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        transforms.RandomErasing(p=0.1)
    ])

    val_transforms = transforms.Compose([
        transforms.Resize(IMG_SIZE + 32),
        transforms.CenterCrop(IMG_SIZE),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    # --- Dataset with stratified split ---
    full_dataset = datasets.ImageFolder(DATASET_DIR)

    # Filter out tiny classes (< 50 images) and artifact classes
    SKIP_CLASSES = {'PlantVillage'}
    MIN_SAMPLES = 50

    class_counts = {}
    for _, label in full_dataset.samples:
        class_counts[label] = class_counts.get(label, 0) + 1

    valid_classes = set()
    for idx, name in enumerate(full_dataset.classes):
        if name in SKIP_CLASSES:
            print(f"  [SKIP] {name} (artifact)")
            continue
        count = class_counts.get(idx, 0)
        if count < MIN_SAMPLES:
            print(f"  [SKIP] {name} ({count} images < {MIN_SAMPLES} min)")
            continue
        valid_classes.add(idx)

    # Filter samples to valid classes only
    filtered_samples = [(path, label) for path, label in full_dataset.samples if label in valid_classes]

    # Remap labels to be contiguous
    old_to_new = {}
    class_names = []
    for old_idx in sorted(valid_classes):
        new_idx = len(class_names)
        old_to_new[old_idx] = new_idx
        class_names.append(full_dataset.classes[old_idx])

    num_classes = len(class_names)
    targets = np.array([old_to_new[label] for _, label in filtered_samples])

    print(f"Dataset: {len(filtered_samples)} images, {num_classes} classes (filtered from {len(full_dataset.classes)})")

    # Stratified split: ensure each class is proportionally represented
    train_indices = []
    val_indices = []
    rng = np.random.RandomState(42)  # Reproducible

    for cls_idx in range(num_classes):
        cls_indices = np.where(targets == cls_idx)[0]
        rng.shuffle(cls_indices)
        split = int(len(cls_indices) * (1 - VAL_SPLIT))
        train_indices.extend(cls_indices[:split])
        val_indices.extend(cls_indices[split:])

    # Build custom datasets from filtered samples with proper transforms
    train_base = FilteredImageFolder(filtered_samples, old_to_new, transform=train_transforms)
    val_base = FilteredImageFolder(filtered_samples, old_to_new, transform=val_transforms)

    train_dataset = Subset(train_base, train_indices)
    val_dataset = Subset(val_base, val_indices)

    print(f"Train: {len(train_dataset)} | Val: {len(val_dataset)}")
    print(f"Classes: {class_names}")
    print()

    dataloaders = {
        'train': DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True,
                            num_workers=workers, pin_memory=True, persistent_workers=True),
        'val': DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=workers, pin_memory=True, persistent_workers=True)
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Save class indices
    class_indices = {name: i for i, name in enumerate(class_names)}
    with open(os.path.join(OUTPUT_DIR, 'class_indices.json'), 'w') as f:
        json.dump(class_indices, f, indent=2)

    # --- Model: EfficientNetV2-S with pretrained ImageNet weights ---
    print("Loading EfficientNetV2-S (pretrained)...")
    model = models.efficientnet_v2_s(weights=models.EfficientNet_V2_S_Weights.DEFAULT)

    # Freeze early layers for first few epochs (gradual unfreezing)
    for param in model.features[:5].parameters():
        param.requires_grad = False

    # Replace classifier head
    num_ftrs = model.classifier[1].in_features
    model.classifier[1] = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(num_ftrs, num_classes)
    )
    model = model.to(device)

    # --- Training setup ---
    # Compute class weights for imbalanced dataset
    class_sample_counts = np.bincount(targets, minlength=num_classes).astype(float)
    class_weights = 1.0 / (class_sample_counts + 1e-6)
    class_weights = class_weights / class_weights.sum() * num_classes  # Normalize
    class_weights_tensor = torch.FloatTensor(class_weights).to(device)
    print(f"Class weight range: {class_weights.min():.3f} - {class_weights.max():.3f}")

    criterion = nn.CrossEntropyLoss(weight=class_weights_tensor, label_smoothing=0.1)
    optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)

    # OneCycleLR: ramps up then decays — better than cosine for fine-tuning
    steps_per_epoch = len(dataloaders['train'])
    scheduler = optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=LEARNING_RATE,
        steps_per_epoch=steps_per_epoch, epochs=EPOCHS,
        pct_start=0.1, anneal_strategy='cos'
    )

    scaler = GradScaler('cuda')

    best_model_wts = copy.deepcopy(model.state_dict())
    best_acc = 0.0
    patience = 7
    patience_counter = 0
    unfreeze_epoch = 5  # Unfreeze all layers after epoch 5

    print(f"Training for {EPOCHS} epochs (unfreeze backbone at epoch {unfreeze_epoch})...")
    print()
    start_time = time.time()

    for epoch in range(EPOCHS):
        # Gradual unfreezing: unlock backbone after warmup
        if epoch == unfreeze_epoch:
            print(">> Unfreezing all backbone layers")
            for param in model.parameters():
                param.requires_grad = True

        print(f'Epoch {epoch + 1}/{EPOCHS}')
        print('-' * 40)

        for phase in ['train', 'val']:
            if phase == 'train':
                model.train()
            else:
                model.eval()

            running_loss = 0.0
            running_corrects = 0
            total = 0

            loop = tqdm(dataloaders[phase], leave=True, desc=f"  {phase}")

            for inputs, labels in loop:
                inputs = inputs.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True)
                batch_size = inputs.size(0)

                optimizer.zero_grad(set_to_none=True)

                with torch.set_grad_enabled(phase == 'train'):
                    with torch.amp.autocast('cuda'):
                        outputs = model(inputs)
                        loss = criterion(outputs, labels)
                    _, preds = torch.max(outputs, 1)

                if phase == 'train':
                    scaler.scale(loss).backward()
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                    scaler.step(optimizer)
                    scaler.update()
                    scheduler.step()

                running_loss += loss.item() * batch_size
                running_corrects += torch.sum(preds == labels.data).item()
                total += batch_size

                loop.set_postfix(loss=f"{loss.item():.4f}", acc=f"{running_corrects / total:.3f}")

            epoch_loss = running_loss / total
            epoch_acc = running_corrects / total

            lr_now = optimizer.param_groups[0]['lr']
            print(f'  {phase} Loss: {epoch_loss:.4f} | Acc: {epoch_acc:.4f} | LR: {lr_now:.6f}')

            # Save best model
            if phase == 'val':
                if epoch_acc > best_acc:
                    best_acc = epoch_acc
                    best_model_wts = copy.deepcopy(model.state_dict())
                    patience_counter = 0
                    print(f'  >> New Best: {best_acc:.4f} ({best_acc * 100:.1f}%). Saving...')

                    torch.save(model.state_dict(), PT_MODEL_PATH)

                    model_config = {
                        'class_names': list(class_names),
                        'num_classes': num_classes,
                        'model_architecture': 'efficientnet_v2_s',
                        'best_val_accuracy': round(best_acc * 100, 2),
                        'input_size': [IMG_SIZE, IMG_SIZE],
                        'timestamp': time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                    with open(CONFIG_PATH, 'w') as f:
                        json.dump(model_config, f, indent=4)
                else:
                    patience_counter += 1
                    if patience_counter >= patience:
                        print(f"\n  Early stopping at epoch {epoch + 1} (no improvement for {patience} epochs)")
                        break
        else:
            # Only executed if inner loop didn't break
            continue
        break  # Break outer loop if inner loop broke (early stopping)

        print()

    elapsed = time.time() - start_time
    print()
    print("=" * 60)
    print(f"Training Complete in {elapsed // 60:.0f}m {elapsed % 60:.0f}s")
    print(f"Best Val Accuracy: {best_acc * 100:.2f}%")
    print("=" * 60)

    # --- Export ONNX ---
    model.load_state_dict(best_model_wts)
    model.eval()

    dummy_input = torch.randn(1, 3, IMG_SIZE, IMG_SIZE, device=device)
    print(f"\nExporting ONNX to {MODEL_PATH}...")
    torch.onnx.export(
        model, dummy_input, MODEL_PATH,
        verbose=False,
        input_names=['input'],
        output_names=['output'],
        opset_version=14,  # 14 is well-supported by onnxruntime-web
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}}
    )
    print(f"ONNX model saved ({os.path.getsize(MODEL_PATH) / 1e6:.1f} MB)")
    print("DONE.")


if __name__ == '__main__':
    train()
