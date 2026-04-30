import requests
import time
import sys
import io
import os
from PIL import Image

SERVER_URL = "http://127.0.0.1:5000"
API_KEY = os.environ.get("KROPSCAN_API_KEY", "")

# Use a real image from the repository
REAL_IMAGE_PATH = os.path.join(
    os.getcwd(), 
    "PlantVillage", 
    "Tomato_healthy", 
    "000146ff-92a4-4db6-90ad-8fce2ae4fddd___GH_HL Leaf 259.1.JPG"
)

def create_real_image_payload():
    # Load the real image
    if os.path.exists(REAL_IMAGE_PATH):
        print(f"[INFO] Using real image for testing: {os.path.basename(REAL_IMAGE_PATH)}")
        with open(REAL_IMAGE_PATH, 'rb') as f:
            img_data = f.read()
        return img_data
    else:
        print(f"[WARN] Real image not found at {REAL_IMAGE_PATH}. Falling back to dummy image.")
        return create_dummy_image()

def create_dummy_image():
    # Create a green image to simulate a plant leaf
    img = Image.new('RGB', (260, 260), color = 'green')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    return img_byte_arr.read()

def verify_server():
    print(f"Testing connection to {SERVER_URL}...")
    
    # 1. Health Check
    try:
        response = requests.get(f"{SERVER_URL}/health", timeout=5)
        if response.status_code == 200:
            print("[OK] Health check passed.")
            print(response.json())
        else:
            print(f"[FAIL] Health check returned {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Could not connect to server: {e}")
        return False

    # 2. Prediction Test
    print("\nTesting prediction endpoint...")
    try:
        img_data = create_real_image_payload()
        files = {'image': ('test.jpg', img_data, 'image/jpeg')}
        headers = {'X-KropScan-Key': API_KEY, 'X-User-ID': 'test_user'}
        
        response = requests.post(f"{SERVER_URL}/predict", files=files, headers=headers, timeout=10)
        
        if response.status_code == 200:
            print("[OK] Prediction successful!")
            result = response.json()
            # Safe print for Windows
            import json
            print(json.dumps(result, indent=2, ensure_ascii=True))
            
            # Check confidence
            conf = result.get('confidence', 0)
            if conf > 0.5:
                 print(f"\n[SUCCESS] High confidence detected: {conf:.1%}")
            else:
                 print(f"\n[WARN] Low confidence detected: {conf:.1%}")
            return True
        else:
            print(f"[FAIL] Prediction failed with {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"[FAIL] Prediction request error: {e}")
        return False

if __name__ == "__main__":
    # Wait a bit for server to start if running immediately after startup
    print("Waiting 5 seconds for server to be fully ready...")
    time.sleep(5)
    
    if verify_server():
        print("\n[SUCCESS] VERIFICATION SUCCESSFUL")
        sys.exit(0)
    else:
        print("\n[FAILURE] VERIFICATION FAILED")
        sys.exit(1)
