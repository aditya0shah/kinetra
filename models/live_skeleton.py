"""
Live skeleton (pose) viewer using the trained SkeletonPoseModel.

Runs foot pressure -> pose estimation and displays the predicted 33-landmark
skeleton in an interactive 3D view. Input from BLE or from saved .npz files.

Usage:
    # Live from BLE foot sensor
    python models/live_skeleton.py --model-path best_skeleton_model.pth --mode ble --device-name "BLE_Test"

    # From saved .npz (animate through predicted poses)
    python models/live_skeleton.py --model-path best_skeleton_model.pth --mode file --input data/raw/idle/idle_ep01_20260118_071618.npz
"""

import torch
import numpy as np
import argparse
import time
from pathlib import Path
from collections import deque
import sys
import threading

# Add project root for imports
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from models.skeleton import SkeletonPoseModel
from backend.decode import decode_frame_u16
from backend.ble import MagicFrameAssembler
from bleak import BleakClient, BleakScanner
import asyncio

# BLE (Nordic UART)
UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
UART_TX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
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

# Shared state for BLE -> main thread
latest_pose = None
pose_ready = False


def preprocess_matrix(matrix: np.ndarray) -> np.ndarray:
    """Match PoseEstimationDataset: (max_clip - x) / max_clip, clip [0,1]."""
    out = (MAX_CLIP - matrix.astype(np.float32)) / MAX_CLIP
    return np.clip(out, 0.0, 1.0)


def load_skeleton_model(path: str, device: str = "cpu"):
    """Load SkeletonPoseModel from state_dict (best_skeleton_model.pth)."""
    model = SkeletonPoseModel()
    state = torch.load(path, map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def update_3d_plot(ax, pose: np.ndarray):
    """Draw 33 landmarks and connections in 3D. pose: (33, 3) x,y,z."""
    ax.clear()
    ax.set_xlim3d(-1, 1)
    ax.set_ylim3d(-1, 1)
    ax.set_zlim3d(-1, 1)
    ax.set_xlabel("X")
    ax.set_ylabel("Z")
    ax.set_zlabel("Y")

    if pose is None or pose.size == 0:
        return

    # Match live_pose_3d_viewer: xs=-x, ys=-z, zs=-y for consistent orientation
    xs = -pose[:, 0]
    ys = -pose[:, 2]
    zs = -pose[:, 1]

    ax.scatter(xs, ys, zs, c="r", s=20)
    for i, j in MP_POSE_CONNECTIONS:
        if i < len(xs) and j < len(xs):
            ax.plot([xs[i], xs[j]], [ys[i], ys[j]], [zs[i], zs[j]], color="b")


def run_from_file(model, device: str, filepath: Path):
    """Load .npz, run model, animate 3D pose in a loop."""
    import matplotlib.pyplot as plt

    data = np.load(filepath)
    matrices = data["matrices"].astype(np.float32)  # (15, 12, 8)
    matrices = preprocess_matrix(matrices)
    # (1, 15, 1, 12, 8)
    x = torch.tensor(matrices, dtype=torch.float32).unsqueeze(0).unsqueeze(2).to(device)

    with torch.no_grad():
        out = model(x)  # (1, 15, 33, 3)
    poses = out[0].cpu().numpy()  # (15, 33, 3)

    fig = plt.figure(figsize=(8, 8))
    ax = fig.add_subplot(111, projection="3d")

    print(f"Loaded {filepath.name}, {len(poses)} frames. Close window or Ctrl+C to exit.")
    plt.ion()
    try:
        while True:
            for t, p in enumerate(poses):
                update_3d_plot(ax, p)
                fig.suptitle(f"Frame {t+1}/{len(poses)}")
                plt.draw()
                plt.pause(0.08)
    except (KeyboardInterrupt, Exception):
        pass
    plt.ioff()
    plt.close()


async def run_ble_stream(model, device: str, device_name: str):
    """Connect to BLE, run sliding-window inference, set latest_pose for main to draw."""
    global latest_pose, pose_ready

    # Discover
    dev = None
    for d in await BleakScanner.discover(timeout=10.0):
        if d.name and device_name.lower() in d.name.lower():
            dev = d
            break
    if dev is None:
        print(f"  '{device_name}' not found. Trying Nordic UART service...")
        by_svc = await BleakScanner.discover(timeout=10.0, service_uuids=[UART_SERVICE_UUID])
        if by_svc:
            print(f"  Found {len(by_svc)} device(s) with UART service.")
            dev = by_svc[0]
    if dev is None:
        print("❌ No BLE device found.")
        return

    print(f"✓ Connecting to {dev.name or dev.address}...")
    payload_len = 4 + NUM_ROWS * NUM_COLS * 2
    assembler = MagicFrameAssembler(payload_len, magic=0xBEEF)
    frame_buffer = deque(maxlen=SEQUENCE_LENGTH)

    def on_notify(sender, data: bytearray):
        global latest_pose, pose_ready
        try:
            for payload in assembler.add_chunk(bytes(data)):
                _, mat = decode_frame_u16(
                    payload, min_v=-1.0, max_v=MAX_CLIP, rows=NUM_ROWS, cols=NUM_COLS
                )
                frame_buffer.append(preprocess_matrix(mat))
                if len(frame_buffer) < SEQUENCE_LENGTH:
                    continue
                seq = np.stack(list(frame_buffer), axis=0)
                x = torch.tensor(seq, dtype=torch.float32).unsqueeze(0).unsqueeze(2).to(device)
                with torch.no_grad():
                    out = model(x)  # (1, 15, 33, 3)
                # Use last timestep for live view
                p = out[0, -1].cpu().numpy()  # (33, 3)
                latest_pose = p
                pose_ready = True
        except Exception as e:
            print(f"\n❌ Frame error: {e}")

    async with BleakClient(dev) as client:
        await client.start_notify(UART_TX_CHAR_UUID, on_notify)
        print("✓ BLE connected. Receiving frames...")
        try:
            while True:
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        finally:
            await client.stop_notify(UART_TX_CHAR_UUID)


def run_ble_mode(model, device: str, device_name: str):
    """Run BLE in a background thread; main thread drives matplotlib 3D."""
    import matplotlib.pyplot as plt

    global latest_pose, pose_ready

    fig = plt.figure(figsize=(8, 8))
    ax = fig.add_subplot(111, projection="3d")

    def ble_thread_fn():
        asyncio.run(run_ble_stream(model, device, device_name))

    t = threading.Thread(target=ble_thread_fn, daemon=True)
    t.start()

    # Give BLE time to connect
    time.sleep(2.0)

    plt.ion()
    print("3D view: close window or Ctrl+C to exit.")
    try:
        while plt.fignum_exists(fig.number):
            if pose_ready:
                update_3d_plot(ax, latest_pose)
                pose_ready = False
            plt.draw()
            plt.pause(0.05)
    except Exception:
        pass
    plt.ioff()
    plt.close()


def main():
    parser = argparse.ArgumentParser(description="Live skeleton view (foot -> pose)")
    parser.add_argument("--model-path", type=str, default="best_skeleton_model.pth",
                        help="Path to SkeletonPoseModel state_dict (e.g. best_skeleton_model.pth)")
    parser.add_argument("--mode", choices=["ble", "file"], default="file",
                        help="ble: BLE foot sensor; file: .npz")
    parser.add_argument("--input", type=str,
                        help="Path to .npz (required in file mode)")
    parser.add_argument("--device-name", type=str, default="BLE_Test",
                        help="BLE device name or substring (ble mode)")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cpu",
                        help="Device for model (default cpu for compatibility with BLE)")
    args = parser.parse_args()

    dev = args.device
    if dev == "cuda" and not torch.cuda.is_available():
        dev = "cpu"

    path = Path(args.model_path)
    if not path.exists():
        path = project_root / args.model_path
    if not path.exists():
        print(f"❌ Model not found: {args.model_path}")
        return

    print(f"Loading model from {path}...")
    model = load_skeleton_model(str(path), device=dev)
    print(f"✓ Model on {dev}")

    if args.mode == "file":
        if not args.input:
            print("❌ --input required in file mode")
            return
        inp = Path(args.input)
        if not inp.exists():
            print(f"❌ File not found: {inp}")
            return
        run_from_file(model, dev, inp)
    else:
        run_ble_mode(model, dev, args.device_name)


if __name__ == "__main__":
    main()
