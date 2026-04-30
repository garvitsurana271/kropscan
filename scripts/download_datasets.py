"""
KropScan Multi-Dataset Downloader & Merger
Downloads and merges multiple plant disease datasets into a unified structure.

Target: ~200K images, 80+ classes, 20+ crops (including Indian staples)
"""

import os
import json
import shutil
from pathlib import Path
from PIL import Image
from tqdm import tqdm
import warnings
warnings.filterwarnings('ignore')

# === PATHS ===
BASE_DIR = Path(__file__).parent
RAW_DIR = BASE_DIR / 'datasets_raw'
MERGED_DIR = BASE_DIR / 'dataset_unified'
STATS_PATH = BASE_DIR / 'dataset_stats.json'

RAW_DIR.mkdir(exist_ok=True)
MERGED_DIR.mkdir(exist_ok=True)

# === CLASS NAME NORMALIZATION ===
# Everything maps to: Crop___Disease_Name (PlantVillage convention)
# "healthy" classes use: Crop___healthy


def normalize_class_name(raw_name: str, source: str = '') -> str:
    """Normalize class names to Crop___Disease format."""

    # BD Crop dataset uses various formats — normalize them
    bd_mapping = {
        # Rice
        'Rice___Brown_Spot': 'Rice___Brown_Spot',
        'Rice___Healthy': 'Rice___healthy',
        'Rice___Leaf_Blast': 'Rice___Leaf_Blast',
        'Rice___Neck_Blast': 'Rice___Neck_Blast',
        'Rice___Hispa': 'Rice___Hispa',
        'Rice___Tungro': 'Rice___Tungro',
        'Rice___BLB': 'Rice___Bacterial_Leaf_Blight',
        'Rice___Leaf_Scald': 'Rice___Leaf_Scald',
        'Rice___Sheath_Blight': 'Rice___Sheath_Blight',

        # Wheat
        'Wheat___Brown_Rust': 'Wheat___Brown_Rust',
        'Wheat___Yellow_Rust': 'Wheat___Yellow_Rust',
        'Wheat___Healthy': 'Wheat___healthy',
        'Wheat___Stem_Rust': 'Wheat___Stem_Rust',
        'Wheat___Septoria': 'Wheat___Septoria',
        'Wheat___Stem_Fly': 'Wheat___Stem_Fly',

        # Mango
        'Mango___Anthracnose': 'Mango___Anthracnose',
        'Mango___Healthy': 'Mango___healthy',
        'Mango___Bacterial_Canker': 'Mango___Bacterial_Canker',
        'Mango___Cutting_Weevil': 'Mango___Cutting_Weevil',
        'Mango___Die_Back': 'Mango___Die_Back',
        'Mango___Gall_Midge': 'Mango___Gall_Midge',
        'Mango___Powdery_Mildew': 'Mango___Powdery_Mildew',
        'Mango___Sooty_Mould': 'Mango___Sooty_Mould',

        # Cotton
        'Cotton___Bacterial_Blight': 'Cotton___Bacterial_Blight',
        'Cotton___Curl_Virus': 'Cotton___Curl_Virus',
        'Cotton___Fusarium_Wilt': 'Cotton___Fusarium_Wilt',
        'Cotton___Healthy': 'Cotton___healthy',

        # Sugarcane
        'Sugarcane___Bacterial_Blight': 'Sugarcane___Bacterial_Blight',
        'Sugarcane___Healthy': 'Sugarcane___healthy',
        'Sugarcane___Red_Rot': 'Sugarcane___Red_Rot',
        'Sugarcane___Red_Stripe': 'Sugarcane___Red_Stripe',
        'Sugarcane___Rust': 'Sugarcane___Rust',

        # Jute
        'Jute___Healthy': 'Jute___healthy',
        'Jute___Stem_Rot': 'Jute___Stem_Rot',
    }

    # Paddy Doctor class mapping
    paddy_mapping = {
        'bacterial_leaf_blight': 'Rice___Bacterial_Leaf_Blight',
        'bacterial_leaf_streak': 'Rice___Bacterial_Leaf_Streak',
        'bacterial_panicle_blight': 'Rice___Bacterial_Panicle_Blight',
        'blast': 'Rice___Leaf_Blast',
        'brown_spot': 'Rice___Brown_Spot',
        'dead_heart': 'Rice___Dead_Heart',
        'downy_mildew': 'Rice___Downy_Mildew',
        'hispa': 'Rice___Hispa',
        'normal': 'Rice___healthy',
        'tungro': 'Rice___Tungro',
    }

    # Wheat dataset mapping
    wheat_mapping = {
        'Healthy': 'Wheat___healthy',
        'healthy': 'Wheat___healthy',
        'Stem Fly': 'Wheat___Stem_Fly',
        'stem_fly': 'Wheat___Stem_Fly',
        'Black Rust': 'Wheat___Stem_Rust',
        'black_rust': 'Wheat___Stem_Rust',
        'Brown Rust': 'Wheat___Brown_Rust',
        'brown_rust': 'Wheat___Brown_Rust',
        'Yellow Rust': 'Wheat___Yellow_Rust',
        'yellow_rust': 'Wheat___Yellow_Rust',
        'Stem Rust': 'Wheat___Stem_Rust',
        'Leaf Rust': 'Wheat___Brown_Rust',
    }

    # Mango dataset mapping
    mango_mapping = {
        'Anthracnose': 'Mango___Anthracnose',
        'Bacterial Canker': 'Mango___Bacterial_Canker',
        'Cutting Weevil': 'Mango___Cutting_Weevil',
        'Die Back': 'Mango___Die_Back',
        'Gall Midge': 'Mango___Gall_Midge',
        'Healthy': 'Mango___healthy',
        'Powdery Mildew': 'Mango___Powdery_Mildew',
        'Sooty Mould': 'Mango___Sooty_Mould',
    }

    # Cotton dataset mapping
    cotton_mapping = {
        'diseased cotton leaf': 'Cotton___Disease',
        'diseased cotton plant': 'Cotton___Disease',
        'fresh cotton leaf': 'Cotton___healthy',
        'fresh cotton plant': 'Cotton___healthy',
    }

    if source == 'paddy':
        return paddy_mapping.get(raw_name, f'Rice___{raw_name}')
    elif source == 'wheat':
        return wheat_mapping.get(raw_name, f'Wheat___{raw_name}')
    elif source == 'mango':
        return mango_mapping.get(raw_name, f'Mango___{raw_name}')
    elif source == 'cotton':
        return cotton_mapping.get(raw_name, f'Cotton___{raw_name}')
    elif source == 'bd':
        # Try direct mapping first
        if raw_name in bd_mapping:
            return bd_mapping[raw_name]
        # Try to auto-parse "Crop___Disease" format
        if '___' in raw_name:
            parts = raw_name.split('___')
            crop = parts[0]
            disease = parts[1]
            if disease.lower() == 'healthy':
                return f'{crop}___healthy'
            return raw_name
        return raw_name
    else:
        # PlantVillage format — already normalized
        return raw_name


def is_valid_image(filepath):
    """Check if file is a valid image."""
    try:
        with Image.open(filepath) as img:
            img.verify()
        return True
    except:
        return False


def copy_images(src_dir, class_name, prefix=''):
    """Copy images from src_dir to merged class directory."""
    dest_dir = MERGED_DIR / class_name
    dest_dir.mkdir(exist_ok=True)

    copied = 0
    src_path = Path(src_dir)
    if not src_path.exists():
        return 0

    for img_file in src_path.iterdir():
        if img_file.suffix.lower() in ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff'):
            dest_name = f"{prefix}{img_file.name}" if prefix else img_file.name
            dest_file = dest_dir / dest_name
            if not dest_file.exists():
                try:
                    shutil.copy2(img_file, dest_file)
                    copied += 1
                except:
                    pass
    return copied


def download_and_merge_plantvillage():
    """Use the existing PlantVillage_HF dataset."""
    pv_dir = BASE_DIR / 'PlantVillage_HF'
    if not pv_dir.exists():
        pv_dir = BASE_DIR.parent / 'PlantVillage_HF'

    if not pv_dir.exists():
        print("  [SKIP] PlantVillage_HF not found")
        return 0

    total = 0
    for class_dir in sorted(pv_dir.iterdir()):
        if class_dir.is_dir():
            class_name = class_dir.name
            # Skip the PlantVillage artifact class
            if class_name == 'PlantVillage' or class_name.startswith('.'):
                continue
            n = copy_images(class_dir, class_name, prefix='pv_')
            total += n
    return total


def download_bd_crop():
    """Download BD Crop Vegetable Plant Disease Dataset from HuggingFace."""
    print("  Downloading BD Crop Disease Dataset (123K images)...")
    print("  This is a large dataset — may take 10-20 minutes...")

    try:
        from datasets import load_dataset

        ds = load_dataset(
            "Saon110/bd-crop-vegetable-plant-disease-dataset",
            cache_dir=str(RAW_DIR / 'hf_cache'),
            trust_remote_code=True
        )

        total = 0
        for split_name in ds:
            split = ds[split_name]
            print(f"  Processing {split_name} split ({len(split)} images)...")

            for i, example in enumerate(tqdm(split, desc=f"    {split_name}")):
                img = example.get('image')
                label = example.get('label', '')

                if img is None or not label:
                    continue

                # Get string label
                if isinstance(label, int):
                    # Need to get features to map int -> string
                    label_str = split.features['label'].int2str(label)
                else:
                    label_str = str(label)

                class_name = normalize_class_name(label_str, source='bd')

                dest_dir = MERGED_DIR / class_name
                dest_dir.mkdir(exist_ok=True)

                dest_file = dest_dir / f"bd_{split_name}_{i}.jpg"
                if not dest_file.exists():
                    img.save(dest_file, 'JPEG', quality=95)
                    total += 1

        return total

    except Exception as e:
        print(f"  [ERROR] BD Crop download failed: {e}")
        print("  Try: pip install datasets Pillow")
        return 0


def download_paddy_doctor():
    """Download Paddy Doctor from Kaggle."""
    print("  Downloading Paddy Doctor (Rice diseases from Tamil Nadu)...")

    paddy_dir = RAW_DIR / 'paddy-disease-classification'

    if not paddy_dir.exists():
        try:
            os.system(f'kaggle competitions download -c paddy-disease-classification -p "{RAW_DIR}"')
            # Extract
            import zipfile
            zip_path = RAW_DIR / 'paddy-disease-classification.zip'
            if zip_path.exists():
                with zipfile.ZipFile(zip_path, 'r') as z:
                    z.extractall(paddy_dir)
                zip_path.unlink()
        except Exception as e:
            print(f"  [ERROR] Kaggle download failed: {e}")
            print("  Make sure kaggle credentials are set up (~/.kaggle/kaggle.json)")
            return 0

    # Find the train_images directory
    train_dir = None
    for root, dirs, files in os.walk(paddy_dir):
        if 'train_images' in dirs:
            train_dir = Path(root) / 'train_images'
            break

    if not train_dir or not train_dir.exists():
        print("  [SKIP] Paddy Doctor train_images not found")
        return 0

    total = 0
    for class_dir in sorted(train_dir.iterdir()):
        if class_dir.is_dir():
            class_name = normalize_class_name(class_dir.name, source='paddy')
            n = copy_images(class_dir, class_name, prefix='paddy_')
            total += n
    return total


def download_wheat():
    """Download Wheat Plant Diseases from Kaggle."""
    print("  Downloading Wheat Plant Diseases...")

    wheat_dir = RAW_DIR / 'wheat-plant-diseases'

    if not wheat_dir.exists():
        try:
            os.system(f'kaggle datasets download -d kushagra3204/wheat-plant-diseases -p "{RAW_DIR}"')
            import zipfile
            zip_path = RAW_DIR / 'wheat-plant-diseases.zip'
            if zip_path.exists():
                with zipfile.ZipFile(zip_path, 'r') as z:
                    z.extractall(wheat_dir)
                zip_path.unlink()
        except Exception as e:
            print(f"  [ERROR] Wheat download failed: {e}")
            return 0

    # Find image directories
    total = 0
    for root, dirs, files in os.walk(wheat_dir):
        for d in dirs:
            class_dir = Path(root) / d
            # Only process leaf directories (skip parent dirs)
            imgs = [f for f in class_dir.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg', '.png')]
            if imgs:
                class_name = normalize_class_name(d, source='wheat')
                n = copy_images(class_dir, class_name, prefix='wheat_')
                total += n
    return total


def download_mango():
    """Download Mango Leaf Disease from Kaggle."""
    print("  Downloading Mango Leaf Disease Dataset...")

    mango_dir = RAW_DIR / 'mango-leaf-disease-dataset'

    if not mango_dir.exists():
        try:
            os.system(f'kaggle datasets download -d aryashah2k/mango-leaf-disease-dataset -p "{RAW_DIR}"')
            import zipfile
            zip_path = RAW_DIR / 'mango-leaf-disease-dataset.zip'
            if zip_path.exists():
                with zipfile.ZipFile(zip_path, 'r') as z:
                    z.extractall(mango_dir)
                zip_path.unlink()
        except Exception as e:
            print(f"  [ERROR] Mango download failed: {e}")
            return 0

    total = 0
    for root, dirs, files in os.walk(mango_dir):
        for d in dirs:
            class_dir = Path(root) / d
            imgs = [f for f in class_dir.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg', '.png')]
            if imgs:
                class_name = normalize_class_name(d, source='mango')
                n = copy_images(class_dir, class_name, prefix='mango_')
                total += n
    return total


def download_cotton():
    """Download Cotton Plant Disease from HuggingFace."""
    print("  Downloading Cotton Plant Disease Dataset...")

    try:
        from datasets import load_dataset

        ds = load_dataset(
            "Francesco/cotton-plant-disease",
            cache_dir=str(RAW_DIR / 'hf_cache'),
            trust_remote_code=True
        )

        total = 0
        for split_name in ds:
            split = ds[split_name]
            for i, example in enumerate(tqdm(split, desc=f"    cotton-{split_name}")):
                img = example.get('image')
                label = example.get('label', '')

                if img is None:
                    continue

                if isinstance(label, int):
                    label_str = split.features['label'].int2str(label)
                else:
                    label_str = str(label)

                class_name = normalize_class_name(label_str, source='cotton')

                dest_dir = MERGED_DIR / class_name
                dest_dir.mkdir(exist_ok=True)

                dest_file = dest_dir / f"cotton_{split_name}_{i}.jpg"
                if not dest_file.exists():
                    img.save(dest_file, 'JPEG', quality=95)
                    total += 1

        return total

    except Exception as e:
        print(f"  [ERROR] Cotton download failed: {e}")
        return 0


def generate_stats():
    """Generate dataset statistics."""
    stats = {}
    total_images = 0

    for class_dir in sorted(MERGED_DIR.iterdir()):
        if class_dir.is_dir() and not class_dir.name.startswith('.'):
            count = len([f for f in class_dir.iterdir()
                         if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.bmp', '.webp')])
            stats[class_dir.name] = count
            total_images += count

    # Group by crop
    crops = {}
    for class_name, count in stats.items():
        crop = class_name.split('___')[0] if '___' in class_name else class_name
        if crop not in crops:
            crops[crop] = {'classes': [], 'total': 0}
        crops[crop]['classes'].append(class_name)
        crops[crop]['total'] += count

    report = {
        'total_images': total_images,
        'total_classes': len(stats),
        'total_crops': len(crops),
        'crops': crops,
        'class_counts': stats
    }

    with open(STATS_PATH, 'w') as f:
        json.dump(report, f, indent=2)

    return report


def main():
    print("=" * 60)
    print("KROPSCAN MULTI-DATASET DOWNLOADER & MERGER")
    print("=" * 60)
    print()

    results = {}

    # 1. PlantVillage (already downloaded)
    print("[1/5] PlantVillage (local)...")
    results['PlantVillage'] = download_and_merge_plantvillage()
    print(f"  -> {results['PlantVillage']} images merged\n")

    # 2. BD Crop Disease (HuggingFace — the big one)
    print("[2/5] BD Crop Disease Dataset (HuggingFace)...")
    results['BD_Crop'] = download_bd_crop()
    print(f"  -> {results['BD_Crop']} images merged\n")

    # 3. Paddy Doctor (Kaggle)
    print("[3/5] Paddy Doctor - Rice (Kaggle)...")
    results['Paddy_Doctor'] = download_paddy_doctor()
    print(f"  -> {results['Paddy_Doctor']} images merged\n")

    # 4. Wheat (Kaggle)
    print("[4/5] Wheat Plant Diseases (Kaggle)...")
    results['Wheat'] = download_wheat()
    print(f"  -> {results['Wheat']} images merged\n")

    # 5. Mango (Kaggle)
    print("[5/5] Mango Leaf Disease (Kaggle)...")
    results['Mango'] = download_mango()
    print(f"  -> {results['Mango']} images merged\n")

    # Generate stats
    print("Generating dataset statistics...")
    stats = generate_stats()

    print()
    print("=" * 60)
    print("MERGE COMPLETE")
    print("=" * 60)
    print(f"Total Images: {stats['total_images']:,}")
    print(f"Total Classes: {stats['total_classes']}")
    print(f"Total Crops: {stats['total_crops']}")
    print()
    print("Crops covered:")
    for crop, info in sorted(stats['crops'].items()):
        print(f"  {crop}: {info['total']:,} images ({len(info['classes'])} diseases)")
    print()
    print(f"Stats saved to: {STATS_PATH}")
    print(f"Merged dataset at: {MERGED_DIR}")


if __name__ == '__main__':
    main()
