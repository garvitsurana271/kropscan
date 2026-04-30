import requests
import os
import json

SERVER_URL = "http://127.0.0.1:5000"
API_KEY = os.environ.get("KROPSCAN_API_KEY", "")
BASE_DIR = os.path.join(os.getcwd(), "PlantVillage")

# List of test images covering different classes
TEST_IMAGES = [
    {
        "path": "Tomato_healthy/000146ff-92a4-4db6-90ad-8fce2ae4fddd___GH_HL Leaf 259.1.JPG",
        "expected": "Tomato_healthy"
    },
    {
        "path": "Tomato_Leaf_Mold/0160c3b5-d89e-40e5-a313-49ae1524040a___Crnl_L.Mold 6823.JPG",
        "expected": "Tomato_Leaf_Mold"
    },
    {
        "path": "Potato___Early_blight/001187a0-57ab-4329-baff-e7246a9edeb0___RS_Early.B 8178.JPG",
        "expected": "Potato___Early_blight"
    },
    {
        "path": "Tomato__Tomato_YellowLeaf__Curl_Virus/0036c89d-7743-4895-9fcf-b8d2c1fc8455___YLCV_NREC 0313.JPG",
        "expected": "Tomato__Tomato_YellowLeaf__Curl_Virus"
    },
    {
        "path": "Pepper__bell___healthy/00100ffa-095e-4881-aebf-61fe5af7226e___JR_HL 7886.JPG",
        "expected": "Pepper__bell___healthy"
    },
    {
        "path": "Potato___Late_blight/0441138d-5f9f-4ede-ab9a-49edabc605b3___RS_LB 4235.JPG",
        "expected": "Potato___Late_blight"
    },
    {
        "path": "Pepper__bell___Bacterial_spot/0022d6b7-d47c-4ee2-ae9a-392a53f48647___JR_B.Spot 8964.JPG",
        "expected": "Pepper__bell___Bacterial_spot"
    },
    {
        "path": "Tomato_Early_blight/0012b9d2-2130-4a06-a834-b1f3af34f57e___RS_Erly.B 8389.JPG",
        "expected": "Tomato_Early_blight"
    }
]

def verify_image(img_info):
    rel_path = img_info["path"]
    full_path = os.path.join(BASE_DIR, rel_path.replace("/", os.sep))
    expected = img_info["expected"]
    
    print(f"\n--- Testing: {expected} ---")
    
    if not os.path.exists(full_path):
        print(f"[WARN] File not found: {full_path}")
        return False

    try:
        with open(full_path, 'rb') as f:
            img_data = f.read()
            
        files = {'image': ('test.jpg', img_data, 'image/jpeg')}
        headers = {'X-KropScan-Key': API_KEY, 'X-User-ID': 'test_batch_user'}
        
        response = requests.post(f"{SERVER_URL}/predict", files=files, headers=headers, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            predicted = result.get('disease')
            confidence = result.get('confidence')
            
            print(f"Prediction: {predicted}")
            print(f"Confidence: {confidence:.2%}")
            
            # Use json.dumps for safe printing on Windows
            # print(json.dumps(result, indent=2)) 

            if predicted == expected:
                print(f"[PASS] Correctly identified as {expected}")
                if confidence > 0.7:
                     print("[PASS] High Confidence")
                else:
                     print("[WARN] Low Confidence")
                return True
            else:
                 # Check if the expected class is in the top 5 (which we can't see from here unless we change valid output, 
                 # but based on previous debugging we know the server returns top 1)
                print(f"[FAIL] Expected {expected}, got {predicted}")
                return False
        else:
            print(f"[FAIL] Error {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Request error: {e}")
        return False

def run_batch():
    print(f"Starting Batch Verification on {len(TEST_IMAGES)} images...")
    passed = 0
    for img in TEST_IMAGES:
        if verify_image(img):
            passed += 1
            
    print(f"\n========================================")
    print(f"Batch Complete. Passed: {passed}/{len(TEST_IMAGES)}")
    print(f"========================================")

if __name__ == "__main__":
    run_batch()
