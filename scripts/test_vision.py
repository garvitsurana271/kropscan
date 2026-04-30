import json
import base64
import os
import requests
import sys

OPEN_ROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

def test_qwen_25_vl_72b(image_path):
    if not OPEN_ROUTER_KEY:
        print("ERROR: Set OPENROUTER_API_KEY env var before running this script.")
        sys.exit(1)

    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')
    
    mime_type = "image/jpeg"
    if image_path.lower().endswith(".png"):
        mime_type = "image/png"
    
    final_base64_url = f"data:{mime_type};base64,{base64_image}"

    payload = {
        "model": "openrouter/free",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": """Role: World-Class Plant Pathologist & Agronomist.
Task: Analyze this plant image with extreme precision using a Chain-of-Thought approach.
Language: Output the content of JSON fields (symptoms, cure, treatment_plan) strictly in English language. Keep field names in English.

Process:
1. VISUAL OBSERVATION: List distinct visual symptoms (lesion color, shape, halos, fungal growth, wilting patterns).
2. DEDUCTION: Match these symptoms to potential diseases for this specific crop.
3. CONCLUSION: Determine the single most likely diagnosis.

Output: Provide the response IN STRICT JSON FORMAT ONLY, matching this structure perfectly. Do not wrap in markdown json backticks.
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
                        "type": "image_url",
                        "image_url": {
                            "url": final_base64_url,
                            "detail": "high"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"}
    }
    
    print(f"Pinging Qwen 2.5 72B Instruct via OpenRouter...")
    headers = {
        "Authorization": f"Bearer {OPEN_ROUTER_KEY}",
        "HTTP-Referer": "https://kropscan.com",
        "X-Title": "KropScan Tests",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        
        content = data['choices'][0]['message']['content']
        # Clean up any markdown
        if content.startswith("```json"):
            content = content.replace("```json\n", "").replace("```", "").strip()
            
        result_json = json.loads(content)
        print("\n--- RESULTS ---")
        print(json.dumps(result_json, indent=2))
        
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        if e.response is not None:
            print(f"Response Body: {e.response.text}")
            
    except json.JSONDecodeError as e:
         print(f"JSON Parsing Error. Model output was not valid JSON: {content}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_vision.py <path_to_plant_image.jpg>")
    else:
        test_qwen_25_vl_72b(sys.argv[1])
