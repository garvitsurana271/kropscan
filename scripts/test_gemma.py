import json
import base64
import os
import requests
import sys

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

def test_gemma_3_27b(image_path):
    if not GEMINI_API_KEY:
        print("ERROR: Set GEMINI_API_KEY env var before running this script.")
        sys.exit(1)

    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')
    
    mime_type = "image/jpeg"
    if image_path.lower().endswith(".png"):
        mime_type = "image/png"
    
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

Output: Provide the response IN STRICT JSON FORMAT ONLY. Do not add markdown backticks.
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
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64_image
                    }
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1
        }
    }
    
    print(f"Pinging Gemma 3 27B via Gemini API...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key={GEMINI_API_KEY}"
    headers = {
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        
        content = data['candidates'][0]['content']['parts'][0]['text']
        print("\n--- RESULTS ---")
        print(content)
        
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        if e.response is not None:
            print(f"Response Body: {e.response.text}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_gemma.py <path_to_plant_image.jpg>")
    else:
        test_gemma_3_27b(sys.argv[1])
