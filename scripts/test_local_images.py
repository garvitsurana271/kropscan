import torch
from torchvision import transforms, models
import torch.nn as nn
from PIL import Image
import json
import os

MODEL_PATH = '../public/models/kropscan_production_model.pth'
INDEX_PATH = '../public/models/class_indices.json'

with open(INDEX_PATH, 'r') as f:
    class_idx = json.load(f)
idx_to_class = {v: k for k, v in class_idx.items()}
num_classes = len(class_idx)

print("Loading EfficientNetV2-S model directly from weights...")
model = models.efficientnet_v2_s(weights=None)
num_ftrs = model.classifier[1].in_features
model.classifier[1] = nn.Sequential(
    nn.Dropout(p=0.3),
    nn.Linear(num_ftrs, num_classes)
)
model.load_state_dict(torch.load(MODEL_PATH, map_location='cpu'))
model.eval()

transform = transforms.Compose([
    transforms.Resize(292),
    transforms.CenterCrop(260),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# Images downloaded previously to the project root
images_to_test = {
    "PlantVillage/Potato___Late_blight/0441138d-5f9f-4ede-ab9a-49edabc605b3___RS_LB 4235.JPG": "Potato___Late_blight",
    "PlantVillage/Tomato_Early_blight/0012b9d2-2130-4a06-a834-b1f3af34f57e___RS_Erly.B 8389.JPG": "Tomato_Early_blight"
}

for img_path, expected in images_to_test.items():
    print(f"\n======================================")
    print(f"Testing local image: {img_path}")
    print(f"Expected class includes: {expected.split('_')[-1]}")
    
    if not os.path.exists(img_path):
        print(f"File not found: {img_path}")
        continue
        
    try:
        img = Image.open(img_path).convert('RGB')
        tensor = transform(img).unsqueeze(0)
        
        with torch.no_grad():
            out = model(tensor)
            probs = torch.nn.functional.softmax(out, dim=1)[0]
            top3_prob, top3_id = torch.topk(probs, 3)
            
        print(f"  --- Top 3 Predictions ---")
        for i in range(3):
            pred_class = idx_to_class[top3_id[i].item()]
            prob = top3_prob[i].item() * 100
            
            # Simple substring match for easier validation against slight naming differences
            is_match = expected.split('_')[-1].lower() in pred_class.lower()
            marker = "[MATCH]" if is_match else ""
            
            print(f"    {i+1}. {pred_class} ({prob:.2f}%) {marker}")
    except Exception as e:
        print(f"Error testing {img_path}: {e}")
