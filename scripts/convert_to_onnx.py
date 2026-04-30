import torch
import torch.nn as nn
from torchvision import models
import json
import os

# Paths
MODEL_PATH = 'public/models/kropscan_production_model.pth'
CONFIG_PATH = 'public/models/model_info.json'
ONNX_PATH = 'public/models/kropscan_production_model.onnx'


def convert_to_onnx():
    print("Starting ONNX Conversion...")
    
    # 1. Load Configuration
    with open(CONFIG_PATH, 'r') as f:
        config = json.load(f)
    print(f"Loaded config for model: {config.get('model_architecture', 'Unknown')}")
    
    num_classes = config['num_classes']
    
    # 2. Rebuild Model Architecture
    print("Rebuilding model architecture...")
    model = models.efficientnet_v2_s(weights=None)
    
    # Replicate the classifier modification from training
    num_ftrs = model.classifier[1].in_features
    model.classifier[1] = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(num_ftrs, num_classes)
    )
    
    # 3. Load Weights
    print("Loading model weights...")
    state_dict = torch.load(MODEL_PATH, map_location='cpu')
    model.load_state_dict(state_dict)
    model.eval()
    
    # 4. Create Dummy Input
    input_size = config.get('input_size', [224, 224])[0]
    print(f"Input resolution: {input_size}x{input_size}")
    
    dummy_input = torch.randn(1, 3, input_size, input_size)
    
    # 5. Export to ONNX
    print("Exporting to ONNX...")
    torch.onnx.export(
        model, 
        dummy_input, 
        ONNX_PATH,
        export_params=True,
        opset_version=12,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    
    print(f"Conversion Complete! Saved to: {ONNX_PATH}")
    
    # Verify file size
    size_mb = os.path.getsize(ONNX_PATH) / (1024 * 1024)
    print(f"ONNX Model Size: {size_mb:.2f} MB")

if __name__ == "__main__":
    convert_to_onnx()
