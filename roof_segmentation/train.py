
import os
import torch
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm

import config
from model import DeepLabV3Plus
from dataset import RoofDataset
from loss import FocalLoss

def calculate_iou(pred, target, n_classes=2):
    """
    Calculate IoU (Intersection over Union)
    pred: [B, H, W] (0 or 1)
    target: [B, H, W] (0 or 1)
    """
    iou_list = []
    pred = pred.view(-1)
    target = target.view(-1)
    
    # Ignore background for mIoU focus on Roof? 
    # Usually mIoU is average of all classes (0 and 1).
    
    for cls in range(n_classes):
        pred_inds = (pred == cls)
        target_inds = (target == cls)
        
        intersection = (pred_inds & target_inds).sum().float()
        union = (pred_inds | target_inds).sum().float()
        
        if union == 0:
            iou_list.append(float('nan'))
        else:
            iou_list.append(intersection / union)
            
    return torch.tensor(iou_list).nanmean()

def train():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # 1. Dataset
    full_dataset = RoofDataset(image_dir=config.DATA_DIR, mask_dir=config.PROCESSED_DIR, input_size=config.INPUT_SIZE)
    if len(full_dataset) > 0:
        train_size = int(0.8 * len(full_dataset))
        val_size = len(full_dataset) - train_size
        train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size])
        
        train_loader = DataLoader(train_dataset, batch_size=config.BATCH_SIZE, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=config.BATCH_SIZE, shuffle=False)
    else:
        print("Warning: No data found in data/raw. Creating dummy data structure for validation of script.")
        train_loader = None
        val_loader = None
        
    # 2. Model
    model = DeepLabV3Plus(n_classes=1, backbone=config.BACKBONE).to(device)
    
    # 3. Loss & Optimizer
    criterion = FocalLoss(alpha=config.LOSS_ALPHA, gamma=config.LOSS_GAMMA)
    optimizer = optim.Adam(model.parameters(), lr=config.LEARNING_RATE)
    
    # 4. Training Loop
    best_iou = 0.0
    
    if not os.path.exists(config.CHECKPOINT_DIR):
        os.makedirs(config.CHECKPOINT_DIR)
        
    for epoch in range(config.EPOCHS):
        if train_loader is None:
            break
            
        model.train()
        train_loss = 0.0
        
        progress_bar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{config.EPOCHS}")
        for images, masks in progress_bar:
            images = images.to(device)
            masks = masks.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            
            # Masks are [B, H, W], Outputs [B, 1, H, W]
            loss = criterion(outputs, masks.float())
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
            progress_bar.set_postfix({'loss': loss.item()})
            
        # Validation
        model.eval()
        val_iou = 0.0
        with torch.no_grad():
            for images, masks in val_loader:
                images = images.to(device)
                masks = masks.to(device)
                
                outputs = model(images)
                preds = torch.sigmoid(outputs) > 0.5
                preds = preds.squeeze(1).long()
                
                iou = calculate_iou(preds, masks, n_classes=2)
                val_iou += iou.item()
                
        avg_val_iou = val_iou / len(val_loader)
        print(f"Epoch {epoch+1} - Train Loss: {train_loss/len(train_loader):.4f} - Val mIoU: {avg_val_iou:.4f}")
        
        # Save Best Model
        if avg_val_iou > best_iou and avg_val_iou > 0.79: # Benchmark threshold
            print(f"New Best IoU: {avg_val_iou:.4f} (Saved)")
            best_iou = avg_val_iou
            torch.save(model.state_dict(), config.BEST_MODEL_PATH)

if __name__ == '__main__':
    train()
