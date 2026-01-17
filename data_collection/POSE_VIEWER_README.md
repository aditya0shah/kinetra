# 3D Pose Viewer

Visualize pose landmarks from collected data files in interactive 3D.

## Quick Start

### Interactive Viewer (Recommended)

Navigate through frames with keyboard controls:

```bash
python data_collection/view_pose_3d_interactive.py data/test/idle/idle_ep01_20260117_160107.npz
```

**Keyboard Controls:**
- `→` or `N` - Next frame
- `←` or `P` - Previous frame  
- `↑` or `Home` - First frame
- `↓` or `End` - Last frame
- `0-9` - Jump to frame number
- `Q` - Quit

### Command-Line Viewer

View single frame, animate, or grid view:

```bash
# View first frame
python data_collection/view_pose_3d.py data/test/idle/idle_ep01_20260117_160107.npz

# View specific frame
python data_collection/view_pose_3d.py data/test/idle/idle_ep01_20260117_160107.npz --frame 5

# Animate through all frames
python data_collection/view_pose_3d.py data/test/idle/idle_ep01_20260117_160107.npz --animate

# View all frames in grid
python data_collection/view_pose_3d.py data/test/idle/idle_ep01_20260117_160107.npz --grid

# Disable feet normalization (show original pose orientation)
python data_collection/view_pose_3d.py data/test/idle/idle_ep01_20260117_160107.npz --no-normalize-feet

# List all available files
python data_collection/view_pose_3d.py --list
```

## Features

✅ **3D Visualization**
- Full skeleton with MediaPipe pose connections
- Color-coded joints
- Key landmark labels
- **Automatic feet normalization** - Poses are rotated so feet are perpendicular to ground plane (horizontal)

✅ **Multiple View Modes**
- Single frame view
- Animated playback
- Grid view (all frames at once)
- Interactive navigation

✅ **Data Inspection**
- Frame-by-frame navigation
- Valid landmark count
- Metadata display

✅ **Feet Normalization**
- Automatically rotates pose so feet form a plane perpendicular to vertical axis
- Makes poses easier to compare and visualize consistently
- Uses ankle and heel landmarks to calculate ground plane
- Can be disabled with `--no-normalize-feet` flag

## What You'll See

- **Blue lines**: Skeleton connections between joints
- **Colored dots**: Individual pose landmarks (33 total)
- **Labels**: Key points (nose, shoulders, hips, ankles)
- **3D axes**: X/Y normalized coordinates, Z depth

## Example Usage

```bash
# 1. List available files
python data_collection/view_pose_3d.py --list

# 2. View interactively
python data_collection/view_pose_3d_interactive.py data/test/idle/idle_ep01_20260117_160107.npz

# 3. Or view animated
python data_collection/view_pose_3d.py data/test/idle/idle_ep01_20260117_160107.npz --animate
```

## Notes

- **No pose detected**: If a frame shows "No pose detected", that frame had no valid pose landmarks
- **3D rotation**: Click and drag in matplotlib window to rotate the 3D view
- **Zoom**: Use mouse scroll wheel to zoom in/out
- **Frame timing**: Each frame represents ~0.33 seconds (3 Hz sampling rate)
