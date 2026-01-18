import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from typing import List, Tuple, Optional
import os
import json
from tqdm import tqdm


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
        foot_data += torch.randn_like(foot_data) * 0.01
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
                 use_attention=False, dropout=0.5):
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


def train_epoch(model, dataloader, criterion, optimizer, device, epoch=0):
    """
    Train the model for one epoch.
    
    Args:
        model: The neural network model
        dataloader: DataLoader for training data
        criterion: Loss function
        optimizer: Optimizer
        device: Device to run on (cuda/cpu)
        epoch: Current epoch number (for logging)
    
    Returns:
        Average training loss, accuracy
    """
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0
    
    pbar = tqdm(dataloader, desc=f'Epoch {epoch+1} [Train]')
    for batch_idx, (data, labels) in enumerate(pbar):
        data, labels = data.to(device), labels.to(device)
        
        # Forward pass
        optimizer.zero_grad()
        outputs = model(data)
        loss = criterion(outputs, labels)
        
        # Backward pass
        loss.backward()
        optimizer.step()
        
        # Statistics
        total_loss += loss.item()
        _, predicted = torch.max(outputs.data, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()
        
        # Update progress bar
        pbar.set_postfix({
            'loss': f'{loss.item():.4f}',
            'acc': f'{100 * correct / total:.2f}%'
        })
    
    avg_loss = total_loss / len(dataloader)
    accuracy = 100 * correct / total
    
    return avg_loss, accuracy


def validate(model, dataloader, criterion, device, split_name='Val'):
    """
    Validate the model on a dataset.
    
    Args:
        model: The neural network model
        dataloader: DataLoader for validation/test data
        criterion: Loss function
        device: Device to run on (cuda/cpu)
        split_name: Name of the split (for logging)
    
    Returns:
        Average validation loss, accuracy
    """
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    
    with torch.no_grad():
        pbar = tqdm(dataloader, desc=f'[{split_name}]')
        for data, labels in pbar:
            data, labels = data.to(device), labels.to(device)
            
            # Forward pass
            outputs = model(data)
            loss = criterion(outputs, labels)
            
            # Statistics
            total_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
            
            # Update progress bar
            pbar.set_postfix({
                'loss': f'{loss.item():.4f}',
                'acc': f'{100 * correct / total:.2f}%'
            })
    
    avg_loss = total_loss / len(dataloader)
    accuracy = 100 * correct / total
    
    return avg_loss, accuracy


def save_model(model, optimizer, epoch, loss, accuracy, labels_map, filepath):
    """
    Save model checkpoint.
    
    Args:
        model: The neural network model
        optimizer: Optimizer state
        epoch: Current epoch number
        loss: Current loss value
        accuracy: Current accuracy
        labels_map: Labels mapping dictionary
        filepath: Path to save the checkpoint
    """
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': loss,
        'accuracy': accuracy,
        'labels_map': labels_map,
        'model_config': {
            'num_classes': len(labels_map),
            'hidden_size': model.rnn.hidden_size,
            'num_layers': model.rnn.num_layers,
            'use_attention': model.use_attention,
        }
    }
    
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else '.', exist_ok=True)
    
    torch.save(checkpoint, filepath)
    print(f"Model saved to {filepath}")


def load_model(filepath, device='cpu'):
    """
    Load model checkpoint.
    
    Args:
        filepath: Path to the checkpoint file
        device: Device to load the model on
    
    Returns:
        model, optimizer, epoch, labels_map, checkpoint dictionary
    """
    checkpoint = torch.load(filepath, map_location=device)
    
    # Reconstruct model from checkpoint
    config = checkpoint['model_config']
    model = SportClassifier(
        num_classes=config['num_classes'],
        hidden_size=config['hidden_size'],
        num_layers=config['num_layers'],
        use_attention=config['use_attention']
    )
    
    model.load_state_dict(checkpoint['model_state_dict'])
    model.to(device)
    
    # Create optimizer (you'll need to recreate it with the same parameters)
    optimizer = torch.optim.Adam(model.parameters())
    optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
    
    epoch = checkpoint['epoch']
    labels_map = checkpoint['labels_map']
    
    return model, optimizer, epoch, labels_map, checkpoint


def train_model(
    model,
    train_dataloader,
    val_dataloader,
    num_epochs=50,
    learning_rate=0.001,
    device='cuda',
    save_dir='models/checkpoints',
    save_best=True,
    patience=10,
    labels_map=None
):
    """
    Complete training pipeline.
    
    Args:
        model: The neural network model
        train_dataloader: DataLoader for training data
        val_dataloader: DataLoader for validation data (can be None)
        num_epochs: Number of training epochs
        learning_rate: Learning rate for optimizer
        device: Device to train on ('cuda' or 'cpu')
        save_dir: Directory to save model checkpoints
        save_best: Whether to save best model based on validation accuracy
        patience: Early stopping patience (epochs without improvement)
        labels_map: Labels mapping dictionary
    
    Returns:
        Training history dictionary
    """
    model.to(device)
    
    # Loss function and optimizer
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.5, patience=5,
    )
    
    # Training history
    history = {
        'train_loss': [],
        'train_acc': [],
        'val_loss': [],
        'val_acc': []
    }
    
    best_val_acc = 0.0
    epochs_without_improvement = 0
    best_model_path = os.path.join(save_dir, 'best_model.pth')
    
    print(f"Starting training on {device}")
    print(f"Training samples: {len(train_dataloader.dataset)}")
    if val_dataloader:
        print(f"Validation samples: {len(val_dataloader.dataset)}")
    print(f"Number of classes: {len(labels_map) if labels_map else 'unknown'}")
    print("-" * 60)
    
    for epoch in range(num_epochs):
        # Train
        train_loss, train_acc = train_epoch(
            model, train_dataloader, criterion, optimizer, device, epoch
        )
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        
        # Validate
        if val_dataloader:
            val_loss, val_acc = validate(model, val_dataloader, criterion, device)
            history['val_loss'].append(val_loss)
            history['val_acc'].append(val_acc)
            
            # Learning rate scheduling
            scheduler.step(val_loss)
            
            # Save best model
            if save_best and val_acc > best_val_acc:
                best_val_acc = val_acc
                epochs_without_improvement = 0
                save_model(
                    model, optimizer, epoch, val_loss, val_acc,
                    labels_map, best_model_path
                )
            else:
                epochs_without_improvement += 1
            
            print(f"Epoch {epoch+1}/{num_epochs} - "
                  f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}% | "
                  f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.2f}%")
            
            # Early stopping
            if patience > 0 and epochs_without_improvement >= patience:
                print(f"\nEarly stopping at epoch {epoch+1} "
                      f"(no improvement for {patience} epochs)")
                break
        else:
            # No validation set, just update learning rate based on train loss
            scheduler.step(train_loss)
            print(f"Epoch {epoch+1}/{num_epochs} - "
                  f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}%")
        
        # Save checkpoint every 10 epochs
        if (epoch + 1) % 10 == 0:
            checkpoint_path = os.path.join(save_dir, f'checkpoint_epoch_{epoch+1}.pth')
            save_model(
                model, optimizer, epoch, train_loss, train_acc,
                labels_map, checkpoint_path
            )
    
    print("\nTraining completed!")
    if val_dataloader and save_best:
        print(f"Best validation accuracy: {best_val_acc:.2f}%")
        print(f"Best model saved to: {best_model_path}")
    
    return history


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Train Sport Classifier Model')
    parser.add_argument('--data-dir', type=str, default='data/raw',
                        help='Base data directory')
    parser.add_argument('--train-split', type=str, default='raw',
                        help='Training data split name')
    parser.add_argument('--test-split', type=str, default='test',
                        help='Test data split name')
    parser.add_argument('--train-val-ratio', type=float, default=0.8,
                        help='Train/validation split ratio')
    parser.add_argument('--batch-size', type=int, default=32,
                        help='Batch size for training')
    parser.add_argument('--epochs', type=int, default=50,
                        help='Number of training epochs')
    parser.add_argument('--lr', type=float, default=0.001,
                        help='Learning rate')
    parser.add_argument('--hidden-size', type=int, default=128,
                        help='GRU hidden size')
    parser.add_argument('--num-layers', type=int, default=2,
                        help='Number of GRU layers')
    parser.add_argument('--dropout', type=float, default=0.3,
                        help='Dropout rate')
    parser.add_argument('--use-attention', action='store_true',
                        help='Use temporal attention')
    parser.add_argument('--device', type=str, default='cuda',
                        help='Device to use (cuda/cpu)')
    parser.add_argument('--save-dir', type=str, default='models/checkpoints',
                        help='Directory to save checkpoints')
    parser.add_argument('--patience', type=int, default=10,
                        help='Early stopping patience')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed')
    
    args = parser.parse_args()
    
    # Set random seeds for reproducibility
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(args.seed)
    
    # Set device
    device = args.device if torch.cuda.is_available() and args.device == 'cuda' else 'cpu'
    print(f"Using device: {device}")
    
    # Create datasets
    train_dataset, val_dataset, test_dataset, labels_map = create_datasets(
        data_dir=args.data_dir,
        train_split=args.train_split,
        test_split=args.test_split,
        train_val_ratio=args.train_val_ratio,
        random_seed=args.seed
    )
    
    # Create data loaders
    train_loader = DataLoader(
        train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=2
    )
    
    val_loader = None
    if val_dataset:
        val_loader = DataLoader(
            val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2
        )
    
    test_loader = None
    if test_dataset:
        test_loader = DataLoader(
            test_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2
        )
    
    # Create model
    num_classes = len(labels_map)
    model = SportClassifier(
        num_classes=num_classes,
        hidden_size=args.hidden_size,
        num_layers=args.num_layers,
        use_attention=args.use_attention,
        dropout=args.dropout
    )
    
    print(f"\nModel architecture:")
    print(f"  Classes: {num_classes}")
    print(f"  Hidden size: {args.hidden_size}")
    print(f"  GRU layers: {args.num_layers}")
    print(f"  Attention: {args.use_attention}")
    print(f"  Dropout: {args.dropout}")
    print("-" * 60)
    
    # Train model
    history = train_model(
        model=model,
        train_dataloader=train_loader,
        val_dataloader=val_loader,
        num_epochs=args.epochs,
        learning_rate=args.lr,
        device=device,
        save_dir=args.save_dir,
        patience=args.patience,
        labels_map=labels_map
    )
    
    # Evaluate on test set if available
    if test_loader:
        print("\n" + "=" * 60)
        print("Evaluating on test set...")
        criterion = nn.CrossEntropyLoss()
        test_loss, test_acc = validate(model, test_loader, criterion, device, 'Test')
        print(f"Test Loss: {test_loss:.4f}, Test Accuracy: {test_acc:.2f}%")
    
    # Save training history
    history_path = os.path.join(args.save_dir, 'training_history.json')
    os.makedirs(args.save_dir, exist_ok=True)
    with open(history_path, 'w') as f:
        json.dump(history, f, indent=2)
    print(f"\nTraining history saved to: {history_path}")