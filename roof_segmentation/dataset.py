
import os
import cv2
import torch
import numpy as np
from torch.utils.data import Dataset

class RoofDataset(Dataset):
    """
    Dataset for loading Aerial Images.
    Handles loading and simple preprocessing (normalization).
    Assumes images are already tiled or will be resized/padded to INPUT_SIZE.
    """
    def __init__(self, image_dir, mask_dir=None, input_size=512, transform=None):
        self.image_dir = image_dir
        self.mask_dir = mask_dir
        self.input_size = input_size
        self.transform = transform
        self.images = [f for f in os.listdir(image_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tif', '.tiff'))] if os.path.exists(image_dir) else []

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img_name = self.images[idx]
        img_path = os.path.join(self.image_dir, img_name)
        
        # Load Image
        image = cv2.imread(img_path)
        if image is None:
             raise FileNotFoundError(f"Image not found: {img_path}")
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Basic Padding if smaller than input_size
        h, w = image.shape[:2]
        pad_h = max(0, self.input_size - h)
        pad_w = max(0, self.input_size - w)
        
        if pad_h > 0 or pad_w > 0:
            image = cv2.copyMakeBorder(image, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0)
            
        # Crop if larger (Central crop for simplicity, or top-left)
        # Ideally, we slice beforehand. Here we just ensure 512x512 compliance.
        image = image[:self.input_size, :self.input_size, :]
        
        # Normalize
        image = image.astype(np.float32) / 255.0
        image = torch.from_numpy(image).permute(2, 0, 1) # C, H, W
        
        if self.mask_dir:
            mask_path = os.path.join(self.mask_dir, img_name)
            # Try png if jpg not found for mask
            if not os.path.exists(mask_path):
                 base, _ = os.path.splitext(img_name)
                 mask_path = os.path.join(self.mask_dir, base + ".png")

            if os.path.exists(mask_path):
                mask = cv2.imread(mask_path, 0) # Grayscale
                if pad_h > 0 or pad_w > 0:
                    mask = cv2.copyMakeBorder(mask, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0)
                mask = mask[:self.input_size, :self.input_size]
                mask = mask.astype(np.float32) / 255.0
                mask = torch.from_numpy(mask).long() # Label classes
            else:
                # If no mask found, return empty (for inference or weakly supervised)
                 mask = torch.zeros((self.input_size, self.input_size)).long()
            
            return image, mask
            
        return image

def slice_large_image(image_path, output_dir, tile_size=512, stride=512):
    """
    Slices a large HSR image into smaller tiles.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    img = cv2.imread(image_path)
    h, w = img.shape[:2]
    
    idx = 0
    for y in range(0, h, stride):
        for x in range(0, w, stride):
            # Safe crop
            y_end = min(y + tile_size, h)
            x_end = min(x + tile_size, w)
            
            tile = img[y:y_end, x:x_end]
            
            # Pad if incomplete tile
            th, tw = tile.shape[:2]
            if th < tile_size or tw < tile_size:
                tile = cv2.copyMakeBorder(tile, 0, tile_size - th, 0, tile_size - tw, cv2.BORDER_CONSTANT, value=0)
                
            out_name = f"{os.path.splitext(os.path.basename(image_path))[0]}_tile_{idx}.png"
            cv2.imwrite(os.path.join(output_dir, out_name), tile)
            idx += 1
