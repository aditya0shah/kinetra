# Data Format Summary for Model Architecture

## Overview

Each episode is stored as a compressed `.npz` file containing synchronized foot sensor and pose landmark data.

**File location**: `data/{raw,test}/{class_name}/{class_name}_ep{num:02d}_{timestamp}.npz`

**Example**: `data/raw/running/running_ep01_20241215_143022.npz`

---

## Data Structure

### 1. **Foot Sensor Data** (`matrices`)

- **Shape**: `(15, 12, 8)`
- **Dtype**: `float64`
- **Format**: 
  - `15` = time steps per episode
  - `12` = sensor rows (toes → heel)
  - `8` = sensor columns (left → right)

- **Value Range**: `0.0` to `3700.0` (resistance in ohms)
  - `3700.0` = MAX_CLIP (no pressure or inactive sensor)
  - Lower values = higher pressure
  
- **Inactive Sensors**: 14 coordinates set to `3700.0` (foot curvature edges):
  ```python
  INACTIVE_COORDS = {
      (0,0), (0,1), (0,7), (1,0),  # Top corners
      (6,7), (7,7),                 # Middle edges
      (8,6), (8,7), (9,6), (9,7),   # Bottom edges
      (10,6), (10,7), (11,6), (11,7) # Bottom corners
  }
  ```
  - Total active sensors: 82 (96 - 14 inactive)

- **Sampling**: 3.0 Hz (every ~0.333 seconds)

### 2. **Pose Landmarks** (`pose_landmarks`)

- **Shape**: `(15, 33, 3)`
- **Dtype**: `float64`
- **Format**:
  - `15` = time steps (synchronized with foot sensor)
  - `33` = MediaPipe pose landmarks
  - `3` = coordinates (x, y, z)

- **Coordinate System**:
  - `x, y`: Normalized `[0.0, 1.0]` (image space)
  - `z`: Relative depth (smaller = closer to camera)
  
- **Missing Poses**: If no pose detected, all zeros `(0.0, 0.0, 0.0)`

- **Landmark Indices** (33 total):
  ```python
  0-10:   Face (nose, eyes, ears, mouth)
  11-22:  Upper body (shoulders, elbows, wrists, hands)
  23-32:  Lower body (hips, knees, ankles, heels, feet)
  ```

### 3. **Metadata** (Scalars)

```python
class_label: str          # 'running', 'idle', 'tennis', 'baseball'
episode_num: int          # Episode number (1-10)
timestamp: str            # 'YYYYMMDD_HHMMSS'
sampling_rate: float      # 3.0 Hz
episode_duration: float   # 5.0 seconds
num_pose_landmarks: int   # 33
test_mode: bool (optional) # True if test data
timestamps: array (optional) # Exact timestamps per frame
```

---

## Data Statistics

- **Episodes per class**: Up to 10 (configurable)
- **Samples per episode**: 15
- **Time span per episode**: 5.0 seconds
- **Sampling interval**: ~0.333 seconds (3 Hz)

### Feature Dimensions

**For Classification** (Foot Sensor → Sport Class):
- Input: `(15, 12, 8)` or flattened `(15, 96)` or `(15, 82)` (active only)
- Output: `(num_classes,)` - one-hot or label encoded

**For Pose Prediction** (Foot Sensor → Pose Landmarks):
- Input: `(15, 12, 8)` or flattened `(15, 96)` or `(15, 82)`
- Output: `(15, 33, 3)` or flattened `(15, 99)`

---

## Model Architecture Recommendations

### Input Processing

```python
# Load episode
data = np.load('episode.npz')
foot_data = data['matrices']      # (15, 12, 8)
pose_data = data['pose_landmarks'] # (15, 33, 3)

# Option 1: Keep spatial structure
X = foot_data  # (15, 12, 8) - Use CNN+LSTM/Transformer

# Option 2: Flatten spatial dimensions
X = foot_data.reshape(15, -1)  # (15, 96) - Use LSTM/Transformer

# Option 3: Use only active sensors
active_mask = create_active_mask(12, 8, INACTIVE_COORDS)
X = foot_data[:, active_mask]  # (15, 82) - More efficient
```

### Normalization

```python
# Normalize foot sensor to [0, 1]
foot_normalized = foot_data / MAX_CLIP  # 3700.0

# Pose landmarks are already normalized (x,y in [0,1])
# Z coordinates may need scaling
pose_normalized = pose_data.copy()
pose_normalized[:, :, 2] = (pose_data[:, :, 2] - pose_data[:, :, 2].min()) / \
                           (pose_data[:, :, 2].max() - pose_data[:, :, 2].min() + 1e-8)
```

### Architecture Types

#### 1. **Classification** (Foot → Sport Class)

```
Input: (batch, 15, 12, 8) or (batch, 15, 96)
│
├─ Option A: CNN + LSTM
│   ├─ CNN: Extract spatial features from (12, 8)
│   ├─ Flatten → LSTM: Process temporal sequence (15 timesteps)
│   └─ Dense: Classify into 4 classes
│
├─ Option B: Transformer
│   ├─ Linear projection: (12×8) → embedding_dim
│   ├─ Positional encoding (temporal)
│   ├─ Transformer encoder blocks
│   └─ Classification head
│
└─ Option C: 3D CNN
    └─ Convolve over (time, height, width) dimensions
```

#### 2. **Pose Prediction** (Foot → Pose Landmarks)

```
Input: (batch, 15, 12, 8) or (batch, 15, 96)
Output: (batch, 15, 33, 3) or (batch, 15, 99)
│
├─ Option A: Encoder-Decoder
│   ├─ Encoder: Extract features from foot data (CNN+LSTM)
│   ├─ Decoder: Generate pose landmarks (LSTM/Transformer)
│   └─ Output: (15, 33, 3) - full pose sequence
│
├─ Option B: Transformer
│   ├─ Encoder: Foot sensor embeddings
│   ├─ Decoder: Pose landmark embeddings (with cross-attention)
│   └─ Output: (15, 99) - flattened landmarks
│
└─ Option C: Direct Regression
    └─ CNN+LSTM → Dense layers → (15, 99)
```

### Loss Functions

**Classification**:
- Categorical cross-entropy
- Label smoothing (optional)

**Pose Prediction**:
- MSE/MAE on landmark coordinates
- Weighted loss (higher weight for lower body if focus is on legs)
- Filter missing poses (all-zero landmarks) from loss

### Data Pipeline Example

```python
def load_dataset(data_dir='data/raw'):
    X_foot, X_pose, y = [], [], []
    
    for class_dir in Path(data_dir).iterdir():
        if not class_dir.is_dir():
            continue
        
        class_label = class_dir.name
        for npz_file in class_dir.glob('*.npz'):
            data = np.load(npz_file)
            
            # Filter out episodes with no valid poses
            valid_poses = np.any(data['pose_landmarks'] > 0, axis=(1, 2))
            if np.sum(valid_poses) < 5:  # Skip if < 5 valid poses
                continue
            
            X_foot.append(data['matrices'])
            X_pose.append(data['pose_landmarks'])
            y.append(class_label)
    
    return np.array(X_foot), np.array(X_pose), np.array(y)
```

---

## Key Design Considerations

1. **Temporal Sequence**: 15 timesteps - use RNN/LSTM/Transformer to capture temporal patterns

2. **Spatial Structure**: 12×8 grid - CNN can capture spatial pressure patterns (heel vs toe, left vs right)

3. **Synchronization**: Foot sensor and pose are paired per timestep - can train jointly or separately

4. **Missing Data**: 
   - Inactive sensors: Always `3700.0` (mask them out)
   - Missing poses: All zeros (filter or weight in loss)

5. **Normalization**: 
   - Foot: Normalize by `MAX_CLIP` (3700.0)
   - Pose: X/Y already normalized, Z may need scaling

6. **Augmentation** (if needed):
   - Temporal: Time stretching, jitter
   - Spatial: Flip left/right (mirror pose landmarks too)
   - Noise: Add small noise to sensor readings

---

## Quick Reference

```python
# Episode shape
foot_sensor:   (15, 12, 8)   # 15 timesteps, 12 rows, 8 cols
pose_landmarks: (15, 33, 3)   # 15 timesteps, 33 landmarks, xyz

# Batch shape (typical)
foot_batch:    (batch_size, 15, 12, 8)
pose_batch:    (batch_size, 15, 33, 3)

# Flattened
foot_flat:     (batch_size, 15, 96)   # or (15, 82) if active only
pose_flat:     (batch_size, 15, 99)   # 33×3 = 99
```

---

## Validation

- **Train/Val Split**: By episode (don't split within episodes)
- **Test on separate classes**: Ensure class balance
- **Check pairing**: Verify foot sensor and pose timesteps align
- **Handle missing poses**: Either filter or weight in loss
