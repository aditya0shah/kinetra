import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
import os
from tqdm import tqdm

class PoseEstimationDataset(Dataset):
    def __init__(self, file_paths, max_clip=3700.0):
        self.file_paths = file_paths
        self.max_clip = max_clip

    def __len__(self):
        return len(self.file_paths)

    def __getitem__(self, idx):
        try:
            data = np.load(self.file_paths[idx])
            
            # Input: (15, 12, 8) -> Normalize & Invert (1.0 = Max Pressure)
            foot_data = data['matrices'].astype(np.float32)
            foot_data = (self.max_clip - foot_data) / self.max_clip
            foot_data = np.clip(foot_data, 0, 1)
            
            # Target: (15, 33, 3) 3D coordinates
            pose_data = data['pose_landmarks'].astype(np.float32)
            
            return torch.tensor(foot_data).unsqueeze(1), torch.tensor(pose_data)
        except Exception as e:
            print(f"Error loading {self.file_paths[idx]}: {e}")
            return None

def collate_fn(batch):
    # Filter out failed loads
    batch = list(filter(lambda x: x is not None, batch))
    return torch.utils.data.dataloader.default_collate(batch)



class SkeletonPoseModel(nn.Module):
    def __init__(self, hidden_size=256, num_layers=2, dropout=0.3):
        super(SkeletonPoseModel, self).__init__()
        
        # Spatial Encoder: 12x8 Foot Grid -> Feature Vector
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((3, 2)),
            nn.Flatten() # 64 * 3 * 2 = 384 features
        )
        
        # Temporal Backbone: Bidirectional GRU
        self.rnn = nn.GRU(
            input_size=384,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout
        )
        
        # Regression Head: Maps features to 33 Landmarks (X, Y, Z)
        self.regressor = nn.Sequential(
            nn.Linear(hidden_size * 2, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, 99) # 33 * 3
        )

    def forward(self, x):
        batch_size, timesteps, C, H, W = x.size()
        c_in = x.view(batch_size * timesteps, C, H, W)
        c_out = self.cnn(c_in)
        
        r_in = c_out.view(batch_size, timesteps, -1)
        r_out, _ = self.rnn(r_in)
        
        preds = self.regressor(r_out)
        return preds.view(batch_size, timesteps, 33, 3)

# =================================================================
# 3. Loss: Anatomical Weighted MSE
# =================================================================

class AnatomicalWeightedLoss(nn.Module):
    def __init__(self, device):
        super().__init__()
        # Priority: Lower Body > Upper Body > Face
        self.weights = torch.ones(33).to(device)
        self.weights[23:33] = 20.0 # Hips, Knees, Ankles, Feet
        self.weights[11:23] = 5.0  # Shoulders, Elbows, Wrists
        self.weights[0:11] = 0.5   # Face

    def forward(self, pred, target):
        # Mask missing frames (where target is all zeros)
        mask = (target.abs().sum(dim=(2, 3), keepdim=True) > 0).float()
        
        sq_error = (pred - target) ** 2
        weighted_error = sq_error * self.weights.view(1, 1, 33, 1)
        
        return (weighted_error * mask).sum() / (mask.sum() * 99 + 1e-8)



def run_training(data_dir='data/raw', epochs=100, batch_size=16, lr=1e-4):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Training on: {device}")

    # File setup
    all_files = sorted(list(Path(data_dir).rglob('*.npz')))
    np.random.shuffle(all_files)
    split = int(0.8 * len(all_files))
    
    train_loader = DataLoader(
        PoseEstimationDataset(all_files[:split]), 
        batch_size=batch_size, shuffle=True, collate_fn=collate_fn
    )
    val_loader = DataLoader(
        PoseEstimationDataset(all_files[split:]), 
        batch_size=batch_size, shuffle=False, collate_fn=collate_fn
    )

    model = SkeletonPoseModel().to(device)
    criterion = AnatomicalWeightedLoss(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'min', patience=5, factor=0.5)

    best_v_loss = float('inf')

    for epoch in range(epochs):
        # TRAIN
        model.train()
        train_loss = 0
        for foot, pose in tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}"):
            foot, pose = foot.to(device), pose.to(device)
            optimizer.zero_grad()
            pred = model(foot)
            loss = criterion(pred, pose)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        # VALIDATE
        model.eval()
        val_loss = 0
        with torch.no_grad():
            for foot, pose in val_loader:
                foot, pose = foot.to(device), pose.to(device)
                v_pred = model(foot)
                val_loss += criterion(v_pred, pose).item()
        
        avg_t = train_loss / len(train_loader)
        avg_v = val_loss / len(val_loader)
        scheduler.step(avg_v)

        print(f"Loss -> Train: {avg_t:.6f} | Val: {avg_v:.6f}")

        if avg_v < best_v_loss:
            best_v_loss = avg_v
            torch.save(model.state_dict(), 'best_skeleton_model.pth')
            print("⭐ New Best Model Saved")

if __name__ == "__main__":
    run_training()