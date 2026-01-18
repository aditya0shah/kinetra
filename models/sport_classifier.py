import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from typing import List, Tuple, Optional


class FootSensorDataset(Dataset):
    """
    Dataset for foot sensor classification from pressure sensor data.
    
    Loads foot pressure matrices and class labels from .npz files.
    """
    def __init__(self, file_paths, labels_map=None, max_clip=3700.0):
        self.file_paths = file_paths
        self.labels_map = labels_map or {'idle': 0, 'running': 1, 'tennis': 2, 'baseball': 3}
        self.max_clip = max_clip

    def __len__(self):
        return len(self.file_paths)

    def __getitem__(self, idx):
        data = np.load(self.file_paths[idx])
        
        # Process Foot Data: (15, 12, 8)
        # Invert: 3700 (no pressure) -> 0.0, 0 (max pressure) -> 1.0
        foot_data = data['matrices'].astype(np.float32)
        foot_data = (self.max_clip - foot_data) / self.max_clip
        foot_data = np.clip(foot_data, 0, 1)
        
        # Label
        label = self.labels_map[str(data['class_label'])]
        
        # Return tuple (data, label) - standard PyTorch Dataset pattern
        return torch.tensor(foot_data).unsqueeze(1), torch.tensor(label, dtype=torch.long)


class TemporalAttention(nn.Module):
    """
    Attention mechanism to aggregate temporal features across all timesteps.
    Allows the model to focus on the most discriminative moments in the sequence.
    """
    def __init__(self, hidden_size):
        super(TemporalAttention, self).__init__()
        self.attention = nn.Linear(hidden_size, 1)
        
    def forward(self, rnn_out):
        # rnn_out: (batch, timesteps, hidden_size)
        attention_weights = F.softmax(self.attention(rnn_out), dim=1)  # (batch, timesteps, 1)
        attended = torch.sum(attention_weights * rnn_out, dim=1)  # (batch, hidden_size)
        return attended


class SportClassifier(nn.Module):
    """
    Sport classification model from foot pressure sensor data.
    
    Architecture:
    1. CNN: Extracts spatial features from pressure maps (12x8 grid)
    2. GRU: Processes temporal sequence of spatial features
    3. Attention: Aggregates temporal features (alternative to using only last timestep)
    4. FC: Final classification head
    """
    def __init__(self, num_classes=4, hidden_size=128, num_layers=2, 
                 use_attention=False, dropout=0.3):
        super(SportClassifier, self).__init__()
        
        # Spatial Feature Extractor (CNN)
        # Deeper CNN with dropout for better spatial feature extraction
        self.cnn = nn.Sequential(
            # First block
            nn.Conv2d(1, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.Dropout2d(0.1),  # Add dropout for regularization
            nn.MaxPool2d(2),  # 12x8 -> 6x4
            
            # Second block
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.Dropout2d(0.1),
            
            # Optional third block for deeper feature extraction
            nn.Conv2d(32, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((3, 2)),  # Adaptive pooling for robustness
            nn.Flatten()  # Output: 32 * 3 * 2 = 192
        )
        
        cnn_output_size = 32 * 3 * 2  # 192
        
        # Temporal Processor (GRU)
        self.rnn = nn.GRU(
            input_size=cnn_output_size, 
            hidden_size=hidden_size, 
            num_layers=num_layers, 
            batch_first=True, 
            dropout=dropout if num_layers > 1 else 0,
            bidirectional=False
        )
        
        # Temporal aggregation: attention or last timestep
        self.use_attention = use_attention
        if use_attention:
            self.attention = TemporalAttention(hidden_size)
            temporal_output_size = hidden_size
        else:
            # Use last timestep
            temporal_output_size = hidden_size
        
        # Classification head with dropout
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(temporal_output_size, hidden_size // 2),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden_size // 2, num_classes)
        )

    def forward(self, x):
        """
        Forward pass.
        
        Args:
            x: Input tensor of shape (batch, timesteps, 1, height, width)
               Typically (batch, 15, 1, 12, 8)
        
        Returns:
            logits: Classification logits of shape (batch, num_classes)
        """
        batch_size, timesteps, C, H, W = x.size()
        
        # 1. Extract spatial features with CNN
        # Reshape for CNN: (batch * timesteps, channels, height, width)
        c_in = x.view(batch_size * timesteps, C, H, W)
        c_out = self.cnn(c_in)  # (batch * timesteps, cnn_output_size)
        
        # 2. Reshape for RNN: (batch, timesteps, cnn_output_size)
        r_in = c_out.view(batch_size, timesteps, -1)
        
        # 3. Process temporal sequence with GRU
        r_out, _ = self.rnn(r_in)  # (batch, timesteps, hidden_size)
        
        # 4. Aggregate temporal features
        if self.use_attention:
            # Use attention to weight all timesteps
            temporal_features = self.attention(r_out)
        else:
            # Use only the last timestep
            temporal_features = r_out[:, -1, :]
        
        # 5. Classify
        logits = self.classifier(temporal_features)
        return logits


def load_data_paths(data_dir: str = 'data/raw', 
                    split: Optional[str] = None,
                    labels_map: Optional[dict] = None) -> Tuple[List[Path], dict]:
    """
    Load file paths from the data directory structure.
    
    Data structure: data/{raw,test}/{class_name}/{class_name}_ep{num:02d}_{timestamp}.npz
    
    Args:
        data_dir: Root data directory (e.g., 'data/raw' or 'data/test')
        split: Optional subset name (e.g., 'raw' or 'test'). If None, uses data_dir as-is
        labels_map: Optional mapping of class names to labels. If None, auto-generates from found classes
    
    Returns:
        Tuple of (list of file paths, labels_map dictionary)
    """
    data_path = Path(data_dir)
    
    # Handle split parameter (e.g., split='raw' with base 'data' -> 'data/raw')
    if split:
        data_path = Path('data') / split
    else:
        data_path = Path(data_dir)
    
    if not data_path.exists():
        raise ValueError(f"Data directory not found: {data_path}")
    
    file_paths = []
    class_names = set()
    
    # Scan for class directories
    for class_dir in data_path.iterdir():
        if not class_dir.is_dir():
            continue
        
        class_name = class_dir.name
        class_names.add(class_name)
        
        # Find all .npz files in this class directory
        for npz_file in class_dir.glob('*.npz'):
            file_paths.append(npz_file)
    
    if len(file_paths) == 0:
        raise ValueError(f"No .npz files found in {data_path}")
    
    # Sort file paths for reproducibility
    file_paths = sorted(file_paths)
    
    # Generate labels_map if not provided
    if labels_map is None:
        sorted_classes = sorted(class_names)
        labels_map = {class_name: idx for idx, class_name in enumerate(sorted_classes)}
    
    print(f"Loaded {len(file_paths)} files from {data_path}")
    print(f"Classes found: {sorted(class_names)}")
    print(f"Labels map: {labels_map}")
    
    return file_paths, labels_map


def create_datasets(data_dir: str = 'data/raw',
                    train_split: Optional[str] = 'raw',
                    test_split: Optional[str] = 'test',
                    train_val_ratio: float = 0.8,
                    labels_map: Optional[dict] = None,
                    max_clip: float = 3700.0,
                    random_seed: int = 42) -> Tuple[FootSensorDataset, FootSensorDataset, Optional[FootSensorDataset], dict]:
    """
    Create train, validation, and test datasets from data directory.
    
    Args:
        data_dir: Base data directory (default: 'data/raw')
        train_split: Split name for training data (default: 'raw'). Set to None to use data_dir directly
        test_split: Split name for test data (default: 'test'). Set to None to skip test set
        train_val_ratio: Ratio of training to validation split (default: 0.8)
        labels_map: Optional mapping of class names to labels
        max_clip: Maximum pressure value for normalization (default: 3700.0)
        random_seed: Random seed for train/val split (default: 42)
    
    Returns:
        Tuple of (train_dataset, val_dataset, test_dataset (or None), labels_map)
    """
    # Load training data paths
    train_paths, labels_map = load_data_paths(
        data_dir=data_dir,
        split=train_split,
        labels_map=labels_map
    )
    
    # Split train/val if multiple files
    if len(train_paths) > 1 and train_val_ratio < 1.0:
        np.random.seed(random_seed)
        indices = np.random.permutation(len(train_paths))
        split_idx = int(len(train_paths) * train_val_ratio)
        train_indices = indices[:split_idx]
        val_indices = indices[split_idx:]
        
        train_files = [train_paths[i] for i in train_indices]
        val_files = [train_paths[i] for i in val_indices]
        
        print(f"Train/Val split: {len(train_files)} train, {len(val_files)} val")
    else:
        # Use all for training if only one file or ratio is 1.0
        train_files = train_paths
        val_files = []
    
    # Create training dataset
    train_dataset = FootSensorDataset(train_files, labels_map=labels_map, max_clip=max_clip)
    
    # Create validation dataset
    if val_files:
        val_dataset = FootSensorDataset(val_files, labels_map=labels_map, max_clip=max_clip)
    else:
        val_dataset = None
    
    # Load test data if specified
    test_dataset = None
    if test_split:
        try:
            test_paths, _ = load_data_paths(
                data_dir=data_dir,
                split=test_split,
                labels_map=labels_map  # Use same labels_map
            )
            test_dataset = FootSensorDataset(test_paths, labels_map=labels_map, max_clip=max_clip)
            print(f"Test dataset: {len(test_paths)} files")
        except ValueError:
            print(f"Warning: Test split '{test_split}' not found. Skipping test dataset.")
    
    return train_dataset, val_dataset, test_dataset, labels_map