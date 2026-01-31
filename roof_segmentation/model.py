
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models

class SeparableConv2d(nn.Module):
    """
    Depthwise Separable Convolution.
    Depthwise Conv (3x3) + Pointwise Conv (1x1).
    """
    def __init__(self, in_channels, out_channels, kernel_size=3, stride=1, padding=0, dilation=1, bias=False):
        super(SeparableConv2d, self).__init__()
        self.depthwise = nn.Conv2d(in_channels, in_channels, kernel_size, stride, padding, dilation, groups=in_channels, bias=bias)
        self.pointwise = nn.Conv2d(in_channels, out_channels, 1, 1, 0, 1, 1, bias=bias)
        self.bn = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.depthwise(x)
        x = self.pointwise(x)
        x = self.bn(x)
        x = self.relu(x)
        return x

class ASPP(nn.Module):
    """
    Atrous Spatial Pyramid Pooling (ASPP) Module.
    Refined to use Atrous Separable Convolutions for production efficiency.
    """
    def __init__(self, in_channels, out_channels=256, atrous_rates=[6, 12, 18]):
        super(ASPP, self).__init__()
        modules = []
        # 1x1 conv
        modules.append(nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU()
        ))
        # Atrous convolution branches (Using Separable Conv)
        for rate in atrous_rates:
            modules.append(SeparableConv2d(in_channels, out_channels, 3, padding=rate, dilation=rate))
            
        # Image Pooling
        modules.append(nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(in_channels, out_channels, 1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU()
        ))
        
        self.convs = nn.ModuleList(modules)
        self.project = nn.Sequential(
            nn.Conv2d(len(modules) * out_channels, out_channels, 1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(),
            nn.Dropout(0.5)
        )

    def forward(self, x):
        res = []
        for conv in self.convs:
            res.append(conv(x))
        
        # Resize image pooling branch to match feature map dimensions
        res[-1] = F.interpolate(res[-1], size=x.shape[2:], mode='bilinear', align_corners=False)
        
        res = torch.cat(res, dim=1)
        return self.project(res)

class DeepLabV3Plus(nn.Module):
    """
    DeepLabv3+ Architecture (State-of-the-Art Configuration).
    Backbone: ResNet101 (Modified for OS=16)
    Decoder: Upsampled Features + Low Level Features
    """
    def __init__(self, n_classes=1, backbone='resnet101'):
        super(DeepLabV3Plus, self).__init__()
        
        # --- Encoder (Backbone) ---
        if backbone == 'resnet101':
            full_resnet = models.resnet101(weights=models.ResNet101_Weights.DEFAULT)
            
            self.initial = nn.Sequential(
                full_resnet.conv1,
                full_resnet.bn1,
                full_resnet.relu,
                full_resnet.maxpool
            )
            self.layer1 = full_resnet.layer1 # Low-level features
            self.layer2 = full_resnet.layer2
            self.layer3 = full_resnet.layer3
            self.layer4 = full_resnet.layer4 
            
            self.low_level_features_channels = 256
            self.high_level_features_channels = 2048
        else:
            raise NotImplementedError("Only ResNet101 is supported implementation.")
            
        # --- ASPP ---
        self.aspp = ASPP(self.high_level_features_channels)
        
        # --- Decoder ---
        # 1x1 Conv to reduce low-level channels
        self.low_level_conv = nn.Sequential(
            nn.Conv2d(self.low_level_features_channels, 48, 1, bias=False),
            nn.BatchNorm2d(48),
            nn.ReLU()
        )
        
        # Refinement (3x3 Separable Convolutions)
        self.classifier = nn.Sequential(
            SeparableConv2d(304, 256, 3, padding=1),
            SeparableConv2d(256, 256, 3, padding=1),
            nn.Conv2d(256, n_classes, 1)
        )

    def forward(self, x):
        input_shape = x.shape[-2:]
        
        # Encoder
        x = self.initial(x)
        x = self.layer1(x)
        low_level_features = x
        
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        
        # ASPP
        x = self.aspp(x)
        
        # Decoder
        x = F.interpolate(x, size=low_level_features.size()[2:], mode='bilinear', align_corners=False)
        low_level = self.low_level_conv(low_level_features)
        x = torch.cat((x, low_level), dim=1)
        
        x = self.classifier(x)
        
        # Upsample to Input
        x = F.interpolate(x, size=input_shape, mode='bilinear', align_corners=False)
        
        return x
