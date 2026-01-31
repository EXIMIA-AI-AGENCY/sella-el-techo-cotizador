
import torch
import torch.nn as nn
import torch.nn.functional as F

class FocalLoss(nn.Module):
    """
    Focal Loss for Dense Object Detection / Segmentation
    Equation: FL(pt) = -αt(1 − pt)^γ log(pt)
    
    Parameters:
        alpha (float): Scaling factor (0.25 for background/foreground balance).
        gamma (float): Focusing parameter (2.0 to focus on hard examples).
    """
    def __init__(self, alpha=0.25, gamma=2.0, reduction='mean'):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, inputs, targets):
        """
        inputs: [Batch, 1, H, W] -> Logits (before sigmoid)
        targets: [Batch, H, W] -> Binary labels (0 or 1)
        """
        # Flatten inputs and targets
        inputs = inputs.view(-1)
        targets = targets.view(-1)
        
        # Calculate BCE (Binary Cross Entropy)
        # pos_weight arg likely not needed if using explicit Focal Loss math, 
        # but using stable binary_cross_entropy_with_logits is safer for Sigmoid.
        BCE = F.binary_cross_entropy_with_logits(inputs, targets.float(), reduction='none')
        
        # pt is the probability of the true class.
        # BCE = -log(pt) => pt = exp(-BCE)
        pt = torch.exp(-BCE)
        
        # Focal Loss Formula
        F_loss = self.alpha * (1-pt)**self.gamma * BCE
        
        if self.reduction == 'mean':
            return torch.mean(F_loss)
        elif self.reduction == 'sum':
            return torch.sum(F_loss)
        else:
            return F_loss
