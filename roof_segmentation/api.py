
import os
import io
import torch
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import uvicorn

import config
from model import DeepLabV3Plus
from utils import mask_to_geojson

app = FastAPI(title="Roof Segmentation API", version="1.0")

# Load Model
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = DeepLabV3Plus(n_classes=1, backbone=config.BACKBONE).to(device)

if os.path.exists(config.BEST_MODEL_PATH):
    model.load_state_dict(torch.load(config.BEST_MODEL_PATH, map_location=device))
    print("Loaded best model.")
else:
    print("Warning: No checkpoint found. Using random weights.")

model.eval()

@app.post("/predict")
async def predict_roof(file: UploadFile = File(...)):
    # Read Image
    contents = await file.read()
    nparr = np.fromstring(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Preprocess
    # Resize/Pad to expected input size if needed, or scan sliding window.
    # For this simple endpoint, we assume input is close to training size or we resize.
    original_size = image.shape[:2]
    
    # Simple Resize for inference (In prod: Sliding Window)
    img_resized = cv2.resize(image, (config.INPUT_SIZE, config.INPUT_SIZE))
    
    # Normalize
    img_tensor = img_resized.astype(np.float32) / 255.0
    img_tensor = torch.from_numpy(img_tensor).permute(2, 0, 1).unsqueeze(0) # [1, C, H, W]
    img_tensor = img_tensor.to(device)
    
    # Inference
    with torch.no_grad():
        output = model(img_tensor)
        prob_map = torch.sigmoid(output).squeeze().cpu().numpy()
        mask = (prob_map > 0.5).astype(np.uint8)
        
    # Resize mask back to original size
    mask_resized = cv2.resize(mask, (original_size[1], original_size[0]), interpolation=cv2.INTER_NEAREST)
    
    # Vectorize
    geojson = mask_to_geojson(mask_resized)
    
    return JSONResponse(content=geojson)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
