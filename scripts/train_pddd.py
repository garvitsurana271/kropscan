"""
WORLD-CLASS Plant Disease Classifier Training
ShuffleNet V2 x1.5 + PDDD Pre-Training (400K plant images)
Target: Beat 95.91% on 156 classes from 8 datasets

Techniques:
- PDDD domain-specific pre-training (not ImageNet)
- Progressive unfreezing (head first, then backbone)
- Differential learning rates
- Label smoothing (0.1)
- Mixup augmentation (alpha=0.2)
- Heavy augmentation (ColorJitter, Perspective, Blur, Erasing)
- Cosine annealing with warm restarts
- Best checkpoint saving with early stopping patience
"""
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Subset
from torchvision import transforms, datasets, models
from pathlib import Path
import json, time, os
import numpy as np

# ═══ CONFIG ═══
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
PDDD_WEIGHTS = Path('scripts/pddd_shufflenet_v2_x1_5.pth')
UNIFIED_DIR = Path('scripts/datasets_retrain/unified')
OUTPUT_DIR = Path('public/models')
CURRENT_BEST = 95.91

EPOCHS = 30
BATCH_SIZE = 48  # Slightly smaller for stability with mixup
LR_HEAD = 0.005
LR_BACKBONE = 0.0005
UNFREEZE_AT = 3
INPUT_SIZE = 260
NUM_WORKERS = 4
MIXUP_ALPHA = 0.2
LABEL_SMOOTH = 0.1
PATIENCE = 8  # Early stopping patience

print("=" * 60)
print("KROPSCAN — World-Class PDDD Training")
print("=" * 60)
print(f"Device: {DEVICE}")
if torch.cuda.is_available():
    g = torch.cuda.get_device_properties(0)
    print(f"GPU: {torch.cuda.get_device_name(0)} ({g.total_memory/1e9:.1f} GB)")
print(f"Target: Beat {CURRENT_BEST}% on 156 classes")
print()

# ═══ MIXUP ═══
def mixup_data(x, y, alpha=0.2):
    if alpha > 0:
        lam = np.random.beta(alpha, alpha)
    else:
        lam = 1.0
    idx = torch.randperm(x.size(0)).to(x.device)
    mixed_x = lam * x + (1 - lam) * x[idx]
    y_a, y_b = y, y[idx]
    return mixed_x, y_a, y_b, lam

def mixup_criterion(criterion, pred, y_a, y_b, lam):
    return lam * criterion(pred, y_a) + (1 - lam) * criterion(pred, y_b)

# ═══ TRANSFORMS ═══
train_transform = transforms.Compose([
    transforms.RandomResizedCrop(INPUT_SIZE, scale=(0.65, 1.0), ratio=(0.8, 1.2)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomVerticalFlip(p=0.1),
    transforms.ColorJitter(brightness=0.35, contrast=0.35, saturation=0.35, hue=0.05),
    transforms.RandomPerspective(distortion_scale=0.25, p=0.3),
    transforms.RandomAffine(degrees=15, translate=(0.1, 0.1), scale=(0.9, 1.1)),
    transforms.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    transforms.RandomErasing(p=0.25, scale=(0.02, 0.15)),
])

val_transform = transforms.Compose([
    transforms.Resize(INPUT_SIZE + 20),
    transforms.CenterCrop(INPUT_SIZE),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

# ═══ DATA ═══
print("Loading dataset...")
train_ds = datasets.ImageFolder(str(UNIFIED_DIR), transform=train_transform)
val_ds = datasets.ImageFolder(str(UNIFIED_DIR), transform=val_transform)

num_classes = len(train_ds.classes)
class_names = train_ds.classes
total = len(train_ds)

np.random.seed(42)
idx = np.random.permutation(total)
split = int(0.8 * total)

train_loader = DataLoader(Subset(train_ds, idx[:split]), batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=True, drop_last=True)
val_loader = DataLoader(Subset(val_ds, idx[split:]), batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=True)

print(f"  {total} images | {num_classes} classes | Train: {split} | Val: {total-split}")

# ═══ MODEL ═══
print("\nBuilding model...")
model = models.shufflenet_v2_x1_5(weights=None)

# Load PDDD pre-trained weights (120 classes — ignore fc mismatch)
state = torch.load(str(PDDD_WEIGHTS), map_location='cpu', weights_only=True)
# Remove classifier weights (different num_classes)
state = {k: v for k, v in state.items() if 'fc' not in k}
miss, unexp = model.load_state_dict(state, strict=False)
print(f"  PDDD backbone loaded (skipped fc). Missing: {len(miss)}, Unexpected: {len(unexp)}")

# New classifier head for 156 classes
in_f = model.fc.in_features
model.fc = nn.Sequential(
    nn.Dropout(0.35),
    nn.Linear(in_f, 512),
    nn.ReLU(inplace=True),
    nn.Dropout(0.2),
    nn.Linear(512, num_classes),
)
model = model.to(DEVICE)

params = sum(p.numel() for p in model.parameters())
print(f"  ShuffleNet V2 x1.5: {params/1e6:.1f}M params -> {num_classes} classes")

# ═══ FREEZE BACKBONE ═══
for n, p in model.named_parameters():
    if 'fc' not in n:
        p.requires_grad = False
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"  Phase 1 (head only): {trainable/1e3:.0f}K trainable params")

# ═══ TRAINING SETUP ═══
criterion = nn.CrossEntropyLoss(label_smoothing=LABEL_SMOOTH)
optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=LR_HEAD, weight_decay=1e-4)
scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=5, T_mult=2)

best_acc = 0.0
best_epoch = 0
no_improve = 0
t0 = time.time()

print(f"\nTraining {EPOCHS} epochs | Unfreeze at {UNFREEZE_AT} | Mixup={MIXUP_ALPHA} | Smooth={LABEL_SMOOTH}")
print(f"Beat target: {CURRENT_BEST}%")
print("-" * 60)

for epoch in range(EPOCHS):
    # ── Unfreeze ──
    if epoch == UNFREEZE_AT:
        print(f"\n>>> UNFREEZING BACKBONE <<<")
        for p in model.parameters():
            p.requires_grad = True
        optimizer = optim.AdamW([
            {'params': model.fc.parameters(), 'lr': LR_HEAD * 0.3},
            {'params': [p for n, p in model.named_parameters() if 'fc' not in n], 'lr': LR_BACKBONE},
        ], weight_decay=1e-4)
        scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=5, T_mult=2)
        t = sum(p.numel() for p in model.parameters() if p.requires_grad)
        print(f"  Phase 2 (full): {t/1e6:.1f}M params\n")

    # ── Train ──
    model.train()
    loss_sum, correct, total_s = 0, 0, 0

    for i, (x, y) in enumerate(train_loader):
        x, y = x.to(DEVICE), y.to(DEVICE)

        # Mixup
        x_mix, y_a, y_b, lam = mixup_data(x, y, MIXUP_ALPHA)
        out = model(x_mix)
        loss = mixup_criterion(criterion, out, y_a, y_b, lam)

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        loss_sum += loss.item()
        _, pred = out.max(1)
        total_s += y.size(0)
        correct += (lam * pred.eq(y_a).float() + (1-lam) * pred.eq(y_b).float()).sum().item()

        if i % 300 == 0 and i > 0:
            print(f"  E{epoch+1} [{i}/{len(train_loader)}] loss={loss_sum/(i+1):.4f} acc={100*correct/total_s:.1f}%")

    scheduler.step()
    train_acc = 100 * correct / total_s

    # ── Validate ──
    model.eval()
    vc, vt = 0, 0
    with torch.no_grad():
        for x, y in val_loader:
            x, y = x.to(DEVICE), y.to(DEVICE)
            out = model(x)
            _, pred = out.max(1)
            vt += y.size(0)
            vc += pred.eq(y).sum().item()
    val_acc = 100 * vc / vt

    elapsed = time.time() - t0
    eta = elapsed / (epoch+1) * (EPOCHS-epoch-1)
    lr_now = optimizer.param_groups[0]['lr']

    print(f"\nEpoch {epoch+1}/{EPOCHS}  [{elapsed/60:.0f}m / ~{eta/60:.0f}m left]")
    print(f"  Train: {train_acc:.2f}%  Loss: {loss_sum/len(train_loader):.4f}  LR: {lr_now:.6f}")
    print(f"  Val:   {val_acc:.2f}%", end="")

    if val_acc > best_acc:
        best_acc = val_acc
        best_epoch = epoch + 1
        no_improve = 0

        torch.save(model.state_dict(), str(OUTPUT_DIR / 'pddd_shufflenet_best.pth'))

        status = ">>> BEATS CURRENT! <<<" if val_acc > CURRENT_BEST else f"(need {CURRENT_BEST}%)"
        print(f"  NEW BEST  {status}")

        json.dump({
            "class_names": class_names,
            "num_classes": num_classes,
            "model_architecture": "shufflenet_v2_x1_5",
            "best_val_accuracy": round(val_acc, 2),
            "input_size": [INPUT_SIZE, INPUT_SIZE],
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "training_version": "v4.0_pddd_pretrain",
            "datasets": ["PlantVillage", "PlantDoc", "Cassava", "Indian Crops", "PDDD-PreTrain"],
            "pretrain": "PDDD (400K plant disease images)",
            "augmentation": "Mixup+ColorJitter+Perspective+Affine+Blur+Erasing",
            "label_smoothing": LABEL_SMOOTH,
        }, open(str(OUTPUT_DIR / 'pddd_model_info.json'), 'w'), indent=4)
    else:
        no_improve += 1
        print(f"  (no improve {no_improve}/{PATIENCE})")
        if no_improve >= PATIENCE:
            print(f"\n>>> EARLY STOPPING at epoch {epoch+1} <<<")
            break

    print()

# ═══ SUMMARY ═══
total_time = time.time() - t0
print("=" * 60)
print(f"DONE in {total_time/60:.0f} minutes")
print(f"Best: {best_acc:.2f}% (epoch {best_epoch})")
print(f"Current: {CURRENT_BEST}%")

if best_acc > CURRENT_BEST:
    improvement = best_acc - CURRENT_BEST
    print(f"\n*** PDDD WINS BY {improvement:.2f}% ***")
    print(f"*** Model size: ~15MB ONNX (vs 81MB current) ***")
    print(f"*** 5x smaller + {improvement:.2f}% more accurate ***")
    print(f"\nNext: python scripts/export_pddd_onnx.py")
else:
    print(f"\n--- Did not beat current. Keeping EfficientNetV2-S. ---")
