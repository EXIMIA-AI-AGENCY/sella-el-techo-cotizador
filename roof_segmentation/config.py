
# DeepLabv3+ Configuration
# Based on prompt specifications for optimal roof segmentation

# Model Architecture
BACKBONE = "resnet101" # Options: resnet101, xception
OUTPUT_STRIDE = 16
NUM_CLASSES = 1 # Binary segmentation (Roof vs Background)

# Training Hyperparameters
BATCH_SIZE = 5
LEARNING_RATE = 1e-4 # 0.0001
EPOCHS = 100
INPUT_SIZE = 512 # 512x512 tiles

# Focal Loss Parameters
LOSS_ALPHA = 0.25
LOSS_GAMMA = 2.0

# Paths
DATA_DIR = "data/raw"
PROCESSED_DIR = "data/processed"
CHECKPOINT_DIR = "checkpoints"
BEST_MODEL_PATH = "checkpoints/best_model.pth"

# Post-processing
SIMPLIFICATION_EPSILON = 1.0 # Tolerance for Ramer-Douglas-Peucker
