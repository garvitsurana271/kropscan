# ai_engine.py - LIGHTWEIGHT ONNX PRODUCTION ENGINE v4.0
"""
KropScan Lightweight AI Engine (ONNX Runtime)
- Optimized for Render Free Tier (512MB RAM Limit)
- Removes heavy PyTorch dependencies
- Uses ONNX Runtime for fast CPU inference
"""

import json
import os
import numpy as np
import onnxruntime as ort
from PIL import Image
import io
from typing import Tuple, Dict, List, Optional
from dataclasses import dataclass

# ============================================================================
# CONFIGURATION
# ============================================================================

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'plant_disease_model.onnx')
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'model_info.json')

class KropScanAI:
    def __init__(self):
        print("="*80)
        print(">> KROPSCAN LIGHTWEIGHT AI ENGINE (ONNX)")
        print("="*80)
        
        self.output_parsed = False
        self.session = None
        self.input_name = None
        self.output_name = None
        
        # Load Config & Treatment DB
        self._load_config()
        self.treatments = self._load_treatment_database()
        
        # Initialize ONNX
        self._init_onnx_session()

    @property
    def model_loaded(self):
        return self.session is not None

    def _load_config(self):
        try:
            with open(CONFIG_PATH, 'r') as f:
                self.config = json.load(f)
            self.class_names = self.config['class_names']
            print(f"[OK] Config Loaded. Classes: {len(self.class_names)}")
        except Exception as e:
            print(f"[WARN] Config Load Error: {e}")
            self.class_names = [] # Fallback

    def _init_onnx_session(self):
        try:
            if not os.path.exists(MODEL_PATH):
                raise FileNotFoundError(f"ONNX Model not found at {MODEL_PATH}")

            print(f"[...] Loading ONNX Model: {os.path.basename(MODEL_PATH)}...")
            
            # Create session
            # Use CPU execution provider for Render
            self.session = ort.InferenceSession(MODEL_PATH, providers=['CPUExecutionProvider'])
            
            # Get input/output metadata
            self.input_name = self.session.get_inputs()[0].name
            self.output_name = self.session.get_outputs()[0].name
            
            print(f"[OK] ONNX Session Ready. Input: {self.input_name}, Output: {self.output_name}")
            print("[INFO] Optimized for Low Memory Environments")
            
        except Exception as e:
            print(f"[ERR] ONNX Initialization Failed: {e}")
            self.session = None

    def preprocess_image(self, image_bytes: bytes) -> np.ndarray:
        """
        Preprocess image to match PyTorch training transforms:
        Resize(224) -> ToTensor() -> Normalize(mean, std)
        """
        # Open Image
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # Resize to 224x224 (training resolution)
        img = img.resize((260, 260), Image.BILINEAR)
        
        # Convert to Numpy & Normalize
        # PyTorch ToTensor() scales [0, 255] -> [0.0, 1.0]
        img_np = np.array(img).astype(np.float32) / 255.0
        
        # Normalize (Standard ImageNet means/stds)
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        
        # (H, W, C) -> Normalize per channel
        img_np = (img_np - mean) / std
        
        # Transpose to (C, H, W) to match PyTorch format
        img_np = img_np.transpose((2, 0, 1))
        
        # Add Batch Dimension -> (1, C, H, W)
        img_np = np.expand_dims(img_np, axis=0)
        
        return img_np

    def predict(self, image_bytes: bytes) -> Tuple[str, float, str]:
        if not self.session:
            return "System Error", 0.0, "AI Engine not initialized."

        try:
            # Preprocess
            input_tensor = self.preprocess_image(image_bytes)
            
            # Run Inference
            outputs = self.session.run([self.output_name], {self.input_name: input_tensor})
            logits = outputs[0][0] # First batch item
            
            # Softmax
            # Suppress "PlantVillage" (dataset artifact)
            if "PlantVillage" in self.class_names:
                 pv_idx = self.class_names.index("PlantVillage")
                 logits[pv_idx] = -1000.0

            exp_logits = np.exp(logits - np.max(logits)) # Numerical stability
            probs = exp_logits / np.sum(exp_logits)
            
            # Get Prediction
            top_k_indices = np.argsort(probs)[-5:][::-1]
            print(f"DEBUG: Top 5: {[self.class_names[i] for i in top_k_indices]} : {probs[top_k_indices]}")

            pred_idx = np.argmax(probs)
            confidence = float(probs[pred_idx])
            
            # Map to Class Name
            if pred_idx < len(self.class_names):
                disease_name = self.class_names[pred_idx]
            else:
                disease_name = "Unknown"
                
            # Get Treatment
            treatment_info = self.treatments.get(disease_name, self.treatments.get("default"))
            treatment_text = treatment_info.get("treatment", "No treatment info.")
            
            print(f"[PREDICT] {disease_name} ({confidence:.1%})")
            return disease_name, confidence, treatment_text

        except Exception as e:
            print(f"[ERR] Prediction Error: {e}")
            return "Error", 0.0, str(e)

    def _load_treatment_database(self) -> Dict:
        """Same comprehensive database as before"""
        return {
            'tomato___early_blight': {
                'disease': 'Tomato Early Blight',
                'severity': 'MEDIUM',
                'treatment': "🍅 TOMATO EARLY BLIGHT\n\n⚠️ SEVERITY: Medium\n\n🔬 SYMPTOMS:\n• Concentric ring spots\n• Lower leaves yellowing\n\n💊 TREATMENT:\n1. Mancozeb 75% WP @ 2.5g/L\n2. Chlorothalonil @ 2g/L\n3. Remove infected leaves\n\n💰 COST: ₹200/acre"
            },
            'tomato___late_blight': {
                'disease': 'Tomato Late Blight',
                'severity': 'CRITICAL',
                'treatment': "🍅🚨 LATE BLIGHT\n\n⚠️ SEVERITY: CRITICAL\n\n🔬 SYMPTOMS:\n• Water-soaked dark spots\n• White fuzz on leaf underside\n\n💊 ACTION:\n1. Metalaxyl + Mancozeb (Ridomil) @ 2.5g/L\n2. Spray every 5 days\n\n💰 COST: ₹600/acre"
            },
            'tomato___healthy': {
                'disease': 'Healthy Tomato',
                'severity': 'NONE',
                'treatment': "✅ HEALTHY PLANT\n\n🎉 No disease detected.\n\nMAINTENANCE:\n• NPK 19:19:19 every 2 weeks"
            },
            'potato___early_blight': {
                'disease': 'Potato Early Blight',
                'severity': 'MEDIUM',
                'treatment': "🥔 POTATO EARLY BLIGHT\n\n💊 TREATMENT:\n1. Mancozeb 75% @ 2.5g/L every 10 days"
            },
            'potato___late_blight': {
                'disease': 'Potato Late Blight',
                'severity': 'CRITICAL',
                'treatment': "🥔🚨 LATE BLIGHT\n\n⚠️ SEVERITY: Critical\n\n💊 TREATMENT:\n1. Metalaxyl + Mancozeb (Ridomil) @ 2.5g/L\n2. Do not store infected tubers"
            },
            'default': {
                'disease': 'Uncertain Diagnosis',
                'severity': 'UNKNOWN',
                'treatment': "⚠️ UNCERTAIN DIAGNOSIS\n\nTry uploading a clearer photo or use KropBot for advice."
            }
        }