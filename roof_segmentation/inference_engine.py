
import os
import cv2
import torch
import numpy as np

import sys
# Add current directory to path so imports work whether run as script or module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import config
    from model import DeepLabV3Plus
    from utils import polygonize_mask
except ImportError:
    from . import config
    from .model import DeepLabV3Plus
    from .utils import polygonize_mask

class RoofInferenceEngine:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = DeepLabV3Plus(n_classes=config.NUM_CLASSES, backbone=config.BACKBONE).to(self.device)
        
        if os.path.exists(config.BEST_MODEL_PATH):
            self.model.load_state_dict(torch.load(config.BEST_MODEL_PATH, map_location=self.device))
            print("Model loaded from checkpoint.")
        else:
            print("Warning: No checkpoint found. Inference will use random weights.")
            
        self.model.eval() # Ensure eval mode for inference (fixes BatchNorm error with batch_size=1)

    def process_roof_image(self, image_path):
        """
        Processes a single image file and returns segmentation metrics.
        Follows 'Master Prompt' specifications.
        """
        # 1. Load and Preprocess
        original_img = cv2.imread(image_path)
        if original_img is None:
            return {"error": "Image not found"}
            
        original_h, original_w = original_img.shape[:2]
        
        # Resize to Model Input Size (512x512)
        # Note: Ideally we strictly slice, but for single image inference, resizing is common.
        img = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img, (config.INPUT_SIZE, config.INPUT_SIZE))
        
        img_tensor = img_resized.astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_tensor).permute(2, 0, 1).unsqueeze(0).to(self.device)
        
        # 2. Inference
        with torch.no_grad():
            output = self.model(img_tensor)
            prob_map = torch.sigmoid(output).squeeze().cpu().numpy()
            
        # 3. Post-Processing
        # Threshold
        mask = (prob_map > 0.5).astype(np.uint8)
        
        # Resize mask back to original
        mask_original = cv2.resize(mask, (original_w, original_h), interpolation=cv2.INTER_NEAREST)
        
        # 4. Vectorization (Ramer-Douglas-Peucker)
        # Using epsilon derived from config
        polygons = polygonize_mask(mask_original, epsilon=config.SIMPLIFICATION_EPSILON)
        
        # 5. Metrics
        area_pixels = np.sum(mask_original)
        # Confidence score (mean probability of foreground pixels)
        if area_pixels > 0:
            prob_map_resized = cv2.resize(prob_map, (original_w, original_h))
            score = np.mean(prob_map_resized[mask_original == 1])
        else:
            score = 0.0
            
        return {
            "segmentation_mask": mask_original.tolist(), # Warning: Large object
            "vector_polygon": polygons,
            "metrics": {
                "area_pixels": int(area_pixels),
                "confidence_score": float(score),
                "model_architecture": "DeepLabv3+ (ResNet101 + ASPP Separable)"
            }
        }

# Global Instance
engine = RoofInferenceEngine()

def process_roof_image(image_path):
    return engine.process_roof_image(image_path)

if __name__ == "__main__":
    # Test
    # result = process_roof_image("path/to/test.jpg")
    pass
