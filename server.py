import sys
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

# Add public/models to path to import ai_engine
sys.path.append(os.path.join(os.getcwd(), 'public', 'models'))

try:
    from ai_engine import KropScanAI
except ImportError as e:
    print(f"Error importing AI Engine: {e}")
    # Create a mock class if real one fails, to allow server to start (for testing flow) or exit
    print("CRITICAL: Could not load ai_engine.py. Make sure it exists in public/models/")
    sys.exit(1)

app = Flask(__name__)
CORS(app) # Enable CORS for frontend

# Initialize Firebase Admin
print("Initializing Firebase Admin SDK...")
try:
    # If deployed, standard application default credentials.
    # Locally, relies on GOOGLE_APPLICATION_CREDENTIALS or fallback
    firebase_admin.initialize_app()
    db = firestore.client()
    print("[OK] Firebase integrated successfully for backend security.")
except Exception as e:
    print(f"[WARN] Firebase Admin failed to initialize (Continuing with Warning): {e}")
    db = None

# Initialize AI Engine
print("Initializing KropScan AI Server (ONNX)...")
try:
    # Initialize ONNX Engine (Zero config needed, paths are internal)
    ai_engine = KropScanAI()
except Exception as e:
    print(f"Error initializing AI engine: {e}")
    ai_engine = None


@app.route('/health', methods=['GET'])
def health():
    print(f"DEBUG: ai_engine type: {type(ai_engine)}")
    if ai_engine:
        print(f"DEBUG: ai_engine.session: {ai_engine.session}")
        print(f"DEBUG: ai_engine.model_loaded: {ai_engine.model_loaded}")
    else:
        print("DEBUG: ai_engine is None")
    
    return jsonify({'status': 'running', 'model_loaded': ai_engine.model_loaded if ai_engine else False})

@app.route('/predict', methods=['POST'])
def predict():
    # Security Check
    api_key = request.headers.get('X-KropScan-Key')
    if api_key != os.environ.get('KROPSCAN_API_KEY', ''):
        return jsonify({'error': 'Unauthorized: Invalid API Key'}), 401

    if not ai_engine:
         print("DEBUG: PREDICT - ai_engine is None")
         return jsonify({'error': 'AI Engine not initialized'}), 500
    print(f"DEBUG: PREDICT - ai_engine loaded: {ai_engine.model_loaded}")

    # User Context Check (Server-Side Limit)
    user_id = request.headers.get('X-User-ID')
    
    if db and user_id:
        try:
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                plan = user_data.get('plan', 'Free')
                scans_today = user_data.get('scans_today', 0)
                
                limit = 100 if ('Pro' in plan or plan == 'PREMIUM') else 10
                if scans_today >= limit:
                     return jsonify({'error': 'Daily scan limit reached. Upgrade plan.'}), 403

                # Increment Usage Safely
                user_ref.update({'scans_today': firestore.Increment(1)})
                print(f"User {user_id} authorized and usage incremented. Plan: {plan}")
            else:
                print(f"User {user_id} not found in DB, proceeding as Guest (Low Priority)")
        except Exception as e:
            print(f"Quota Check Failed: {e}")
            # Fail closed for security if DB is active but errors out.
            return jsonify({'error': 'Server Error during Auth'}), 500

    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400
    
    file = request.files['image']
    image_bytes = file.read()
    
    try:
        # ai_engine.predict returns (disease_name, confidence, treatment_text)
        disease, confidence, treatment = ai_engine.predict(image_bytes)
        
        return jsonify({
            'disease': disease,
            'confidence': float(confidence),
            'treatment': treatment
        })
    except Exception as e:
        print(f"Prediction Error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask Server on port {port}...")
    app.run(host='0.0.0.0', port=port, use_reloader=False)
