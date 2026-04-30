import torch
from torchvision import transforms, models
import torch.nn as nn
from PIL import Image
import requests
from io import BytesIO
import json
from bs4 import BeautifulSoup
import re

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

search_queries = {
    "Potato___Late_blight": "potato late blight leaf clear photo",
    "Tomato___Early_blight": "tomato early blight plant disease clear photo",
    "Apple___Apple_scab": "apple scab leaf real agricultural photo",
    "Grape___Black_rot": "grape black rot leaf macro photo",
    "Corn_(maize)___Common_rust_": "corn common rust leaf closeup"
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'}

for expected_class, query in search_queries.items():
    print(f"\n======================================")
    print(f"Testing True Web Generalization (Google Images)")
    print(f"Target Disease: {expected_class}")
    
    url = f"https://www.google.com/search?hl=en&tbm=isch&q={query.replace(' ', '+')}"
    html = requests.get(url, headers=headers).text
    soup = BeautifulSoup(html, 'html.parser')
    
    # Google embeds image urls in script tags sometimes, but also regular img tags
    # Let's find valid http image links
    imgs = soup.find_all('img')
    img_urls = []
    for img in imgs:
        src = img.get('src')
        if src and src.startswith('http') and 'encrypted-tbn0' in src:
            img_urls.append(src)
            
    success = False
    for img_url in img_urls[:3]:
        print(f"  Attempting to DL Thumbnail: {img_url[:60]}...")
        try:
            response = requests.get(img_url, headers=headers, timeout=5)
            if response.status_code == 200:
                img = Image.open(BytesIO(response.content)).convert('RGB')
                tensor = transform(img).unsqueeze(0)
                
                with torch.no_grad():
                    out = model(tensor)
                    probs = torch.nn.functional.softmax(out, dim=1)[0]
                    top3_prob, top3_id = torch.topk(probs, 3)
                
                print(f"  [DOWNLOAD SUCCESS] Testing image...")
                print(f"  --- Top 3 Predictions ---")
                is_match = idx_to_class[top3_id[0].item()] == expected_class
                for i in range(3):
                    pred_class = idx_to_class[top3_id[i].item()]
                    prob = top3_prob[i].item() * 100
                    marker = "[MATCH]" if pred_class == expected_class else "[FAIL]"
                    print(f"    {i+1}. {pred_class} ({prob:.2f}%) {marker if i==0 else ''}")
                
                success = True
                break
            else:
                print(f"    -> HTTP {response.status_code}")
        except Exception as e:
            print(f"    -> Failed: {str(e)[:50]}")
            
    if not success:
        print(f"  Could not download any images for {expected_class}")
