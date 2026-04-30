import json
import base64
import requests
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    sys.exit("Set GEMINI_API_KEY env var before running this script")
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

TEST_IMAGES = {
    "Tomato_Late_Blight": "https://blogs.cornell.edu/livegpath/files/2021/02/late_blight_tomato_leaf5x1200.jpg",
    "Potato_Early_Blight": "https://vegpath.plantpath.wisc.edu/wp-content/uploads/sites/210/2023/11/potato-early-blight-leaves.jpg",
    "Healthy_Corn": r"C:\Users\Garvit Surana\.gemini\antigravity\brain\f24e1b44-6d87-4fbb-9e01-987f8efa1253\healthy_corn_leaf_1772519290677.png",
    "Red_Sports_Car": r"C:\Users\Garvit Surana\.gemini\antigravity\brain\f24e1b44-6d87-4fbb-9e01-987f8efa1253\red_sports_car_1772519306086.png"
}

def analyze_image(path, name):
    print(f"\n=============================================")
    print(f"🧪 TESTING START: {name}")
    print(f"=============================================")
    
    with open(path, "rb") as image_file:
        base64_data = base64.b64encode(image_file.read()).decode('utf-8')
    
    mime_type = "image/jpeg"
    if path.lower().endswith(".png"):
        mime_type = "image/png"

    url = f"{BASE_URL}/gemma-3-27b-it:generateContent?key={GEMINI_API_KEY}"

    payload = {
        "contents": [{
            "role": "user",
            "parts": [
                {
                    "text": """Role: World-Class Plant Pathologist & Agronomist.
Task: Analyze this plant image with extreme precision using a Chain-of-Thought approach.
Language: Output the content of JSON fields (symptoms, cure, treatment_plan) strictly in English language. Keep field names in English.

Process:
1. VISUAL OBSERVATION: List distinct visual symptoms (lesion color, shape, halos, fungal growth, wilting patterns).
2. DEDUCTION: Match these symptoms to potential diseases for this specific crop.
3. CONCLUSION: Determine the single most likely diagnosis.

Output: Provide the response IN STRICT JSON FORMAT ONLY. Do not wrap in markdown json backticks.
Structure:
{
  "visual_evidence": "Description of what you see (e.g., 'Target-like spots with yellow halos')",
  "disease_name": "Precise name of disease or 'Healthy'",
  "crop_name": "Name of crop",
  "status": "Healthy" | "Moderate" | "Critical",
  "confidence": 0.0 to 1.0 (Be conservative. If unsure, lower score),
  "symptoms": ["Specific symptom 1", "Specific symptom 2", "Visual evidence summary"],
  "cure": ["Chemical remedy 1 (with dosage)", "Organic remedy 2"],
  "treatment_plan": "Step-by-step professional advice for an Indian farmer context."
}
If it is NOT a plant, return {"disease_name": "Not a Plant", "confidence": 0}."""
                },
                {
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": base64_data
                    }
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1
        }
    }

    try:
        print(f"-> Sending payload to Gemma-3-27B Vision...")
        response = requests.post(url, headers={'Content-Type': 'application/json'}, json=payload)
        response.raise_for_status()
        data = response.json()
        
        content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        
        # Clean JSON
        if content.startswith("```json"):
            content = content.replace("```json\n", "").replace("```", "").strip()
        elif content.startswith("```"):
            content = content.replace("```\n", "").replace("```", "").strip()
            
        try:
            parsed = json.loads(content)
            print("[SUCCESS] JSON Parsing successful.")
            print("\n--- DIAGNOSIS RESULT ---")
            print(json.dumps(parsed, indent=2))
        except json.JSONDecodeError:
            print("[ERROR] Invalid JSON returned by model.")
            print("RAW OUTPUT:")
            print(content)
            
    except Exception as e:
        print(f"[ERROR] Error during API call: {e}")
        if hasattr(e, 'response') and e.response:
            print(e.response.text)


def extract_url(url, path):
    print(f"-> Downloading {url} ...")
    try:
        r = requests.get(url, stream=True, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code == 200:
            with open(path, 'wb') as f:
                for chunk in r.iter_content(1024):
                    f.write(chunk)
            return True
        else:
            print(f"Download failed: HTTP {r.status_code}")
            return False
    except Exception as e:
        print(f"Download error: {e}")
        return False

if __name__ == "__main__":
    os.makedirs("test_images", exist_ok=True)
    
    for name, url_or_path in TEST_IMAGES.items():
        if url_or_path.startswith("http"):
            img_path = os.path.join("test_images", f"{name}.jpg")
            if not os.path.exists(img_path):
                if not extract_url(url_or_path, img_path):
                    continue
        else:
            img_path = url_or_path # Use the local path directly

        analyze_image(img_path, name)
