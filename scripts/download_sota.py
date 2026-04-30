import os
from datasets import load_dataset

def download_plantvillage():
    output_base = "PlantVillage_HF"
    print(f"Downloading PlantVillage into {output_base}...")
    
    # BrandonFors version is a clean parquet format ready for loading
    ds = load_dataset("BrandonFors/Plant-Diseases-PlantVillage-Dataset", split="train")
    
    # Get class names
    features = ds.features
    if 'label' in features:
        class_names = features['label'].names
    else:
        print("Could not find 'label' feature.")
        return
        
    print(f"Found {len(class_names)} classes.")
    
    os.makedirs(output_base, exist_ok=True)
    for c in class_names:
        os.makedirs(os.path.join(output_base, c.replace(' ', '_')), exist_ok=True)
        
    for i, item in enumerate(ds):
        img = item['image']
        label_idx = item['label']
        label_name = class_names[label_idx].replace(' ', '_')
        
        out_path = os.path.join(output_base, label_name, f"img_{i}.jpg")
        
        # Save image
        try:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(out_path)
        except Exception as e:
            pass
            
        if i % 5000 == 0:
            print(f"Processed {i} images...")

    print("Download complete!")

if __name__ == "__main__":
    download_plantvillage()
