"""
KropScan Model Retraining v3.0 — Real-World Robustness
=====================================================
Fine-tunes from existing checkpoint on PlantDoc + Cassava + PlantVillage
with heavy augmentation for field photo generalization.

Usage: python retrain_realworld.py
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, ConcatDataset, WeightedRandomSampler
from torchvision import transforms, datasets, models
import os, json, time, shutil
from pathlib import Path
import numpy as np

# ============================================================
# CONFIG
# ============================================================
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
IMG_SIZE = 260
BATCH_SIZE = 48  # Slightly smaller for heavier augmentation
EPOCHS = 15      # Fine-tuning, not training from scratch
LR = 0.0003      # Lower LR for fine-tuning
NUM_WORKERS = 4
MIN_IMAGES_PER_CLASS = 30  # Lower threshold since PlantDoc has fewer images

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / 'datasets_retrain'
UNIFIED_DIR = DATA_DIR / 'unified'  # Pre-merged dataset with all sources
PLANTVILLAGE_DIR = DATA_DIR / 'plantvillage'
PLANTDOC_DIR = DATA_DIR / 'plantdoc'
CASSAVA_DIR = DATA_DIR / 'cassava'
MODEL_DIR = SCRIPT_DIR.parent / 'public' / 'models'
CHECKPOINT = MODEL_DIR / 'kropscan_production_model.pth'

def main():
    print("=" * 60)
    print("KROPSCAN MODEL RETRAINING v3.0 — Real-World Robustness")
    print("=" * 60)
    print(f"Device: {DEVICE}")
    if DEVICE.type == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # ============================================================
    # DATA AUGMENTATION — HEAVY for real-world generalization
    # ============================================================
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.6, 1.0), ratio=(0.75, 1.33)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.3),
        transforms.RandomRotation(30),
        transforms.RandomPerspective(distortion_scale=0.3, p=0.4),
        transforms.ColorJitter(
            brightness=0.4,    # Simulate field lighting variation
            contrast=0.4,
            saturation=0.4,
            hue=0.1            # Slight color shift
        ),
        transforms.RandomGrayscale(p=0.05),
        transforms.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        transforms.RandomErasing(p=0.2, scale=(0.02, 0.15)),  # Simulate occlusion
    ])

    val_transform = transforms.Compose([
        transforms.Resize(int(IMG_SIZE * 1.15)),
        transforms.CenterCrop(IMG_SIZE),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    # ============================================================
    # LOAD DATASETS
    # ============================================================
    # ============================================================
    # LOAD UNIFIED DATASET (pre-merged PlantVillage + PlantDoc + Cassava)
    # ============================================================
    if UNIFIED_DIR.exists() and any(UNIFIED_DIR.iterdir()):
        print(f"Loading unified dataset from {UNIFIED_DIR}...")
        full_dataset = datasets.ImageFolder(str(UNIFIED_DIR), transform=train_transform)
        val_dataset_raw = datasets.ImageFolder(str(UNIFIED_DIR), transform=val_transform)

        num_classes = len(full_dataset.classes)
        class_names = full_dataset.classes

        # Filter small classes
        from collections import Counter
        targets = [t for _, t in full_dataset.samples]
        counts = Counter(targets)
        valid_indices = [i for i, (_, t) in enumerate(full_dataset.samples) if counts[t] >= MIN_IMAGES_PER_CLASS]

        full_dataset = torch.utils.data.Subset(full_dataset, valid_indices)
        val_dataset_raw = torch.utils.data.Subset(val_dataset_raw, valid_indices)

        # Split 85/15
        total = len(full_dataset)
        val_size = int(total * 0.15)
        train_size = total - val_size

        combined_train, _ = torch.utils.data.random_split(full_dataset, [train_size, val_size], generator=torch.Generator().manual_seed(42))
        _, combined_val = torch.utils.data.random_split(val_dataset_raw, [train_size, val_size], generator=torch.Generator().manual_seed(42))

        print(f"Dataset: {total} images, {num_classes} classes")
        print(f"Train: {train_size} | Val: {val_size}")
        print(f"Classes: {class_names[:5]}...{class_names[-3:]}")

        train_loader = DataLoader(combined_train, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=True, drop_last=True)
        val_loader = DataLoader(combined_val, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=True)
    else:
        # Fallback: load individual datasets
        print("Unified dir not found, loading individually...")
        train_datasets = []
        val_datasets = []
        all_classes = set()
        num_classes = 0
        class_names = []

    if not UNIFIED_DIR.exists():
        print("ERROR: Unified dataset not found! Run the dataset merge script first.")
        return
    # MODEL — Load from existing checkpoint
    # ============================================================
    print(f"\nLoading pretrained EfficientNetV2-S + new {num_classes}-class head")
    model = models.efficientnet_v2_s(weights='IMAGENET1K_V1')
    num_ftrs = model.classifier[1].in_features
    model.classifier[1] = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(num_ftrs, num_classes)
    )
    print(f"Model ready: {num_classes} classes, pretrained backbone")

    model = model.to(DEVICE)

    # ============================================================
    # TRAINING
    # ============================================================
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    # Freeze backbone initially, train only classifier
    for param in model.features.parameters():
        param.requires_grad = False

    optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=LR, weight_decay=0.01)
    scheduler = optim.lr_scheduler.OneCycleLR(optimizer, max_lr=LR, epochs=EPOCHS, steps_per_epoch=len(train_loader))

    best_acc = 0.0
    unfreeze_epoch = 3  # Unfreeze backbone after 3 epochs

    print(f"\nTraining for {EPOCHS} epochs (unfreeze backbone at epoch {unfreeze_epoch})...")

    for epoch in range(EPOCHS):
        # Unfreeze backbone
        if epoch == unfreeze_epoch:
            print(">> Unfreezing all backbone layers")
            for param in model.features.parameters():
                param.requires_grad = True
            optimizer = optim.AdamW(model.parameters(), lr=LR * 0.1, weight_decay=0.01)
            scheduler = optim.lr_scheduler.OneCycleLR(optimizer, max_lr=LR * 0.1,
                                                       epochs=EPOCHS - unfreeze_epoch,
                                                       steps_per_epoch=len(train_loader))

        # Train
        model.train()
        train_loss, train_correct, train_total = 0, 0, 0

        for batch_idx, (images, labels) in enumerate(train_loader):
            images, labels = images.to(DEVICE), labels.to(DEVICE)

            optimizer.zero_grad()
            with torch.amp.autocast('cuda'):
                outputs = model(images)
                loss = criterion(outputs, labels)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()

            train_loss += loss.item() * images.size(0)
            _, predicted = outputs.max(1)
            train_total += labels.size(0)
            train_correct += predicted.eq(labels).sum().item()

            if batch_idx % 50 == 0:
                print(f"  Epoch {epoch+1}/{EPOCHS} [{batch_idx}/{len(train_loader)}] "
                      f"loss={loss.item():.4f} acc={train_correct/train_total:.3f}", end='\r')

        train_acc = train_correct / train_total
        train_avg_loss = train_loss / train_total

        # Validate
        model.eval()
        val_loss, val_correct, val_total = 0, 0, 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(DEVICE), labels.to(DEVICE)
                outputs = model(images)
                loss = criterion(outputs, labels)
                val_loss += loss.item() * images.size(0)
                _, predicted = outputs.max(1)
                val_total += labels.size(0)
                val_correct += predicted.eq(labels).sum().item()

        val_acc = val_correct / val_total
        val_avg_loss = val_loss / val_total
        lr = optimizer.param_groups[0]['lr']

        print(f"\nEpoch {epoch+1}/{EPOCHS}")
        print(f"  train Loss: {train_avg_loss:.4f} | Acc: {train_acc:.4f} | LR: {lr:.6f}")
        print(f"  val Loss: {val_avg_loss:.4f} | Acc: {val_acc:.4f}")

        if val_acc > best_acc:
            best_acc = val_acc
            print(f"  >> New Best: {val_acc:.4f} ({val_acc*100:.1f}%). Saving...")
            torch.save(model.state_dict(), str(MODEL_DIR / 'kropscan_production_model.pth'))

            # Save model info
            info = {
                'class_names': class_names,
                'num_classes': num_classes,
                'model_architecture': 'efficientnet_v2_s',
                'best_val_accuracy': round(val_acc * 100, 2),
                'input_size': [IMG_SIZE, IMG_SIZE],
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'training_version': 'v3.0_realworld',
                'datasets': ['PlantVillage', 'PlantDoc', 'Cassava'],
            }
            with open(str(MODEL_DIR / 'model_info.json'), 'w') as f:
                json.dump(info, f, indent=4)

    # ============================================================
    # EXPORT ONNX
    # ============================================================
    print(f"\nBest validation accuracy: {best_acc*100:.2f}%")
    print("Exporting ONNX...")

    model.eval()
    dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE, device=DEVICE)
    onnx_path = str(MODEL_DIR / 'plant_disease_model.onnx')

    torch.onnx.export(
        model, dummy, onnx_path,
        verbose=False,
        input_names=['input'],
        output_names=['output'],
        opset_version=17,
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}}
    )

    onnx_size = os.path.getsize(onnx_path) / 1e6
    print(f"ONNX exported: {onnx_size:.1f} MB")

    # Check for external data file
    data_path = onnx_path + '.data'
    if os.path.exists(data_path):
        data_size = os.path.getsize(data_path) / 1e6
        print(f"ONNX data file: {data_size:.1f} MB")

    print("\nDONE! Run 'npm run build && firebase deploy' to deploy the new model.")


if __name__ == '__main__':
    main()
