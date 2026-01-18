"""
Live skeleton frame generator for VLM integration.

Generates 2D frames from the skeleton model for use with vision models.
Returns base64 encoded PNG images that can be passed to VLM APIs.
"""
import torch
import numpy as np
from pathlib import Path
import sys
from collections import deque
import io
import base64
from PIL import Image
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D

# Add project root for imports
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from models.skeleton import SkeletonPoseModel

NUM_ROWS, NUM_COLS = 12, 8
MAX_CLIP = 3700.0
SEQUENCE_LENGTH = 15

# MediaPipe-style skeleton connections for 33 landmarks
MP_POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20), (11, 23),
    (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28), (27, 29),
    (28, 30), (29, 31), (30, 32), (27, 31), (28, 32),
]

# Hip down only: 23,24=hips 25,26=knees 27–32=ankles/heels/feet
HIP_DOWN = {23, 24, 25, 26, 27, 28, 29, 30, 31, 32}

# MediaPipe foot landmarks: 27,28=ankles 29,30=heels 31,32=foot tips
FOOT_LANDMARKS = [27, 28, 29, 30, 31, 32]

# Ground plane height
Z_FLOOR = -0.95


class SkeletonFrameGenerator:
    """Generates 2D frames from skeleton poses for VLM consumption."""
    
    def __init__(self, model_path: str, device: str = "cpu"):
        """Initialize the frame generator with a trained model."""
        self.device = device
        self.model = self._load_model(model_path)
        self.frame_buffer = deque(maxlen=SEQUENCE_LENGTH)
        
        # Create persistent figure for rendering
        self.fig = plt.figure(figsize=(8, 8))
        self.ax = self.fig.add_subplot(111, projection='3d')
        
    def _load_model(self, path: str):
        """Load SkeletonPoseModel from state_dict."""
        model = SkeletonPoseModel()
        state = torch.load(path, map_location=self.device)
        model.load_state_dict(state)
        model.to(self.device)
        model.eval()
        return model
    
    def preprocess_matrix(self, matrix: np.ndarray) -> np.ndarray:
        """Match PoseEstimationDataset: (max_clip - x) / max_clip, clip [0,1]."""
        out = (MAX_CLIP - matrix.astype(np.float32)) / MAX_CLIP
        return np.clip(out, 0.0, 1.0)
    
    def add_pressure_frame(self, matrix: np.ndarray):
        """Add a pressure matrix to the buffer. Returns True if ready to generate pose."""
        preprocessed = self.preprocess_matrix(matrix)
        self.frame_buffer.append(preprocessed)
        return len(self.frame_buffer) >= SEQUENCE_LENGTH
    
    def generate_pose(self) -> np.ndarray:
        """Generate pose from current buffer. Returns (33, 3) pose array."""
        if len(self.frame_buffer) < SEQUENCE_LENGTH:
            return None
        
        seq = np.stack(list(self.frame_buffer), axis=0)
        x = torch.tensor(seq, dtype=torch.float32).unsqueeze(0).unsqueeze(2).to(self.device)
        
        with torch.no_grad():
            out = self.model(x)  # (1, 15, 33, 3)
        
        # Use last timestep for live view
        pose = out[0, -1].cpu().numpy()  # (33, 3)
        return pose
    
    def _draw_ground_plane(self, z_floor: float = Z_FLOOR):
        """Draw a horizontal ground plane at z=z_floor."""
        r = np.linspace(-1.2, 1.2, 15)
        xx, yy = np.meshgrid(r, r)
        zz = np.full_like(xx, z_floor)
        self.ax.plot_surface(xx, yy, zz, alpha=0.25, color="lightgray", shade=False)
    
    def render_pose_to_frame(self, pose: np.ndarray) -> str:
        """
        Render pose to a base64 encoded PNG image.
        
        Args:
            pose: (33, 3) array of x,y,z coordinates
            
        Returns:
            Base64 encoded PNG string
        """
        if pose is None or pose.size == 0:
            return None
        
        # Clear previous frame
        self.ax.clear()
        self.ax.set_xlim3d(-1.2, 1.2)
        self.ax.set_ylim3d(-1.2, 1.2)
        self.ax.set_zlim3d(-1.2, 1.2)
        self.ax.set_xlabel("X")
        self.ax.set_ylabel("Z")
        self.ax.set_zlabel("Y")
        
        # Draw ground plane
        self._draw_ground_plane()
        
        # Transform coordinates
        xs = -pose[:, 0].astype(np.float64)
        ys = -pose[:, 2].astype(np.float64)
        zs = -pose[:, 1].astype(np.float64)
        
        # Place feet on the plane
        foot_idx = [i for i in FOOT_LANDMARKS if i < len(zs)]
        if foot_idx:
            z_foot_min = float(np.nanmin(zs[foot_idx]))
            if np.isfinite(z_foot_min):
                zs = zs + (Z_FLOOR - z_foot_min)
        
        # Hip down only
        idx = [i for i in HIP_DOWN if i < len(xs)]
        self.ax.scatter(xs[idx], ys[idx], zs[idx], c="r", s=50)
        
        # Draw connections
        for i, j in MP_POSE_CONNECTIONS:
            if i in HIP_DOWN and j in HIP_DOWN and i < len(xs) and j < len(xs):
                self.ax.plot([xs[i], xs[j]], [ys[i], ys[j]], [zs[i], zs[j]], color="b", linewidth=2)
        
        # Convert to base64
        buf = io.BytesIO()
        self.fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        
        return img_base64
    
    def process_and_render(self, matrix: np.ndarray) -> str:
        """
        Process a pressure matrix and render to base64 frame.
        
        Args:
            matrix: (12, 8) pressure matrix
            
        Returns:
            Base64 encoded PNG string or None if buffer not full
        """
        if not self.add_pressure_frame(matrix):
            return None
        
        pose = self.generate_pose()
        if pose is None:
            return None
        
        return self.render_pose_to_frame(pose)
    
    def cleanup(self):
        """Clean up matplotlib resources."""
        plt.close(self.fig)


# Global instance for the backend to use
_generator_instance = None

def get_generator(model_path: str = None, device: str = "cpu"):
    """Get or create the singleton frame generator instance."""
    global _generator_instance
    
    if _generator_instance is None:
        if model_path is None:
            model_path = str(project_root / "best_skeleton_model.pth")
        _generator_instance = SkeletonFrameGenerator(model_path, device)
    
    return _generator_instance
