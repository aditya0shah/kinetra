"""
Interactive script to collect training data for foot pressure classification.

Records 5-second episodes at 3 Hz (15 matrices per episode) with simultaneous
pose landmark detection using MediaPipe.

Classes: running, idle, tennis, baseball
"""

import asyncio
import sys
import numpy as np
import os
import time
import threading
import cv2
from datetime import datetime
from pathlib import Path
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Add project root to path for imports
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from bleak import BleakClient, BleakScanner
from backend.decode import decode_frame_u16

# BLE UART Service UUIDs (Nordic UART Service)
UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
UART_TX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # peripheral -> central


# === Configuration ===
DEVICE_NAME = "BLE_Test"  # Device name to search for (falls back to service UUID scan if not found)

NUM_ROWS = 12
NUM_COLS = 8
MAX_CLIP = 3700.0
EPISODE_DURATION = 5.0  # seconds
SAMPLING_RATE = 1.6  # Hz (matrices per second)
MATRICES_PER_EPISODE = int(EPISODE_DURATION * SAMPLING_RATE)  # 15

# MediaPipe Configuration
POSE_MODEL_PATH = "pose_landmarker_heavy.task"  # Path to MediaPipe pose model
CAMERA_INDEX = 0  # Webcam index (usually 0 for default camera)
NUM_POSE_LANDMARKS = 33  # MediaPipe Pose has 33 landmarks

# Inactive coordinates (row, col) that should be ignored
INACTIVE_COORDS = {
    (0, 0), (0, 1), (0, 7), (1, 0),
    (6, 7), (7, 7),
    (8, 6), (8, 7), (9, 6), (9, 7), (10, 6), (10, 7), (11, 6), (11, 7)
}

CLASSES = ['running', 'idle', 'tennis', 'baseball']
DATA_DIR = Path('data/raw')

# Global state for BLE data
latest_matrix = np.zeros((NUM_ROWS, NUM_COLS))
rows_received = 0
frame_complete = False
ble_connected = False
ble_stream_task = None

# Global state for pose detection
latest_pose_landmarks = None  # Will store array of shape (33, 3) for x, y, z coordinates
pose_detector = None
camera_running = False
pose_thread = None
cap = None


def is_active(r, c):
    """Check if a coordinate is active (not in inactive list)."""
    return (r, c) not in INACTIVE_COORDS


def parse_ble_line(line):
    """Parse BLE format: R0:val,val,val... (one row per line)"""
    global latest_matrix, rows_received, frame_complete
    
    line = line.strip()
    if not line.startswith('R'):
        return False
    
    # Parse format: R0:val1,val2,val3,...
    try:
        # Find the colon separator
        colon_idx = line.find(':')
        if colon_idx == -1:
            return False
        
        # Extract row number
        row_str = line[1:colon_idx]  # Skip 'R' and get number
        r_idx = int(row_str)
        
        if r_idx < 0 or r_idx >= NUM_ROWS:
            return False
        
        # Reset row counter if we're starting a new frame (row 0)
        if r_idx == 0:
            rows_received = 0
            frame_complete = False
        
        # Extract values after colon
        values_str = line[colon_idx + 1:]
        values = values_str.split(',')
        
        # Parse column values
        for c_idx, val_str in enumerate(values):
            if c_idx >= NUM_COLS:
                break
            
            try:
                res = float(val_str.strip())
                
                # Handle inactive coordinates
                if not is_active(r_idx, c_idx):
                    latest_matrix[r_idx, c_idx] = MAX_CLIP
                    continue
                
                # Treat -1 or non-positive as MAX_CLIP
                if res <= 0:
                    res = MAX_CLIP
                else:
                    res = min(res, MAX_CLIP)
                
                latest_matrix[r_idx, c_idx] = res
            except (ValueError, IndexError):
                continue
        
        rows_received += 1
        
        # Mark frame as complete when we have all rows
        if rows_received >= NUM_ROWS:
            frame_complete = True
            rows_received = 0  # Reset for next frame
            return True
        
        return False
            
    except (ValueError, IndexError) as e:
        return False


def collect_episode():
    """Collect one episode (15 matrices over 5 seconds) with simultaneous pose landmarks."""
    global latest_matrix, frame_complete, latest_pose_landmarks
    
    if not ble_connected:
        raise RuntimeError("BLE device not connected!")
    
    matrices = []
    pose_landmarks_list = []  # Store pose landmarks for each sample
    start_time = time.time()
    interval = 1.0 / SAMPLING_RATE  # ~0.333 seconds between samples
    next_sample_time = start_time + interval
    
    print(f"\nRecording episode... (collecting {MATRICES_PER_EPISODE} matrices + pose landmarks)")
    
    # Track last matrix to avoid duplicates
    last_matrix_hash = None
    
    while len(matrices) < MATRICES_PER_EPISODE:
        current_time = time.time()
        
        # Check if it's time to sample
        if current_time >= next_sample_time:
            # Only sample if we have a complete frame
            if frame_complete:
                # Get the most recent complete matrix from BLE
                current_matrix = latest_matrix.copy()
                
                # Create a simple hash to detect if matrix has changed
                matrix_hash = hash(current_matrix.tobytes())
                
                # Only add if matrix has changed (new frame received)
                if matrix_hash != last_matrix_hash:
                    matrices.append(current_matrix.copy())
                    
                    # Capture pose landmarks simultaneously
                    if latest_pose_landmarks is not None:
                        pose_landmarks_list.append(latest_pose_landmarks.copy())
                    else:
                        # If no pose detected, store zeros (or NaN to indicate missing)
                        pose_landmarks_list.append(np.zeros((NUM_POSE_LANDMARKS, 3)))
                    
                    elapsed = current_time - start_time
                    pose_status = "✓" if latest_pose_landmarks is not None else "⚠"
                    print(f"  [{len(matrices)}/{MATRICES_PER_EPISODE}] Collected at {elapsed:.2f}s {pose_status}", end='\r')
                    last_matrix_hash = matrix_hash
                    frame_complete = False  # Reset flag after sampling
            
            next_sample_time += interval
        
        # Small sleep to prevent CPU spinning
        time.sleep(0.01)
    
    print(f"\n✓ Collected {len(matrices)} matrices and {len(pose_landmarks_list)} pose landmark sets")
    
    # Convert to numpy arrays
    matrices_array = np.array(matrices)  # Shape: (15, 12, 8)
    pose_landmarks_array = np.array(pose_landmarks_list)  # Shape: (15, 33, 3)
    
    return matrices_array, pose_landmarks_array


def save_episode(matrices, pose_landmarks, class_label, episode_num):
    """Save episode data to disk (foot sensor matrices + pose landmarks)."""
    class_dir = DATA_DIR / class_label
    class_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{class_label}_ep{episode_num:02d}_{timestamp}.npz"
    filepath = class_dir / filename
    
    np.savez_compressed(
        filepath,
        matrices=matrices,  # Shape: (15, 12, 8) - foot pressure sensor data
        pose_landmarks=pose_landmarks,  # Shape: (15, 33, 3) - MediaPipe pose landmarks (x, y, z)
        class_label=class_label,
        episode_num=episode_num,
        timestamp=timestamp,
        sampling_rate=SAMPLING_RATE,
        episode_duration=EPISODE_DURATION,
        num_pose_landmarks=NUM_POSE_LANDMARKS
    )
    
    return filepath


def count_episodes_per_class():
    """Count how many episodes have been collected for each class."""
    counts = {}
    for class_label in CLASSES:
        class_dir = DATA_DIR / class_label
        if class_dir.exists():
            episodes = list(class_dir.glob('*.npz'))
            counts[class_label] = len(episodes)
        else:
            counts[class_label] = 0
    return counts


def initialize_pose_detector():
    global pose_detector
    try:
        base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO, # Matching the Viewer
            output_segmentation_masks=False,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )
        pose_detector = vision.PoseLandmarker.create_from_options(options)
        print("✓ Pose detector initialized in VIDEO mode!")
        return True
    except Exception as e:
        print(f"❌ Initialization error: {e}")
        return False


def extract_pose_landmarks(detection_result):
    # Change from .pose_landmarks to .pose_world_landmarks
    if not detection_result.pose_world_landmarks or len(detection_result.pose_world_landmarks) == 0:
        return None
    
    # Extract the meter-based 3D coordinates
    world_landmarks = detection_result.pose_world_landmarks[0]
    landmarks = np.zeros((NUM_POSE_LANDMARKS, 3))
    for idx, landmark in enumerate(world_landmarks):
        landmarks[idx] = [landmark.x, landmark.y, landmark.z]
    
    return landmarks


def run_pose_detection():
    """Run pose detection continuously in a background thread."""
    global latest_pose_landmarks, camera_running, cap
    
    if pose_detector is None:
        print("⚠ Pose detector not initialized. Skipping pose detection.")
        return
    
    # Initialize camera
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print(f"⚠ Warning: Could not open camera {CAMERA_INDEX}. Pose detection disabled.")
        return
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    camera_running = True
    print("✓ Camera opened. Starting pose detection...")
    
    try:
        while camera_running:
            ret, frame = cap.read()
            if not ret: break
            
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            # Use millisecond timestamp for the VIDEO mode tracker
            timestamp_ms = int(time.time() * 1000)
            
            # Use .detect_for_video instead of .detect
            detection_result = pose_detector.detect_for_video(mp_image, timestamp_ms)
            
            landmarks = extract_pose_landmarks(detection_result)
            if landmarks is not None:
                latest_pose_landmarks = landmarks.copy()
    except Exception as e:
        print(f"Error in pose detection thread: {e}")
    finally:
        if cap is not None:
            cap.release()
        camera_running = False
        print("Pose detection stopped.")


class MagicFrameAssembler:
    """Assembles fixed-length frames from a byte stream by realigning on a 2-byte magic header (0xBEEF)."""
    def __init__(self, frame_len: int, magic: int = 0xBEEF):
        self.frame_len = frame_len
        self._buffer = bytearray()
        self._magic = magic
        self._magic_bytes = bytes([magic & 0xFF, (magic >> 8) & 0xFF])  # little-endian

    def add_chunk(self, data: bytes) -> list[bytes]:
        if not data:
            return []
        
        self._buffer.extend(data)
        out: list[bytes] = []

        while True:
            # Find magic start
            i = self._buffer.find(self._magic_bytes)
            if i == -1:
                # Keep last byte in case magic splits across chunks
                if len(self._buffer) > 1:
                    self._buffer[:] = self._buffer[-1:]
                return out

            # Drop any junk before magic
            if i > 0:
                del self._buffer[:i]

            # Need full frame
            if len(self._buffer) < self.frame_len:
                return out

            frame = bytes(self._buffer[:self.frame_len])
            del self._buffer[:self.frame_len]
            out.append(frame)


def on_ble_binary_frame(matrix: np.ndarray):
    """Process a complete binary frame (decoded matrix)."""
    global latest_matrix, frame_complete
    
    # Update latest matrix
    latest_matrix = matrix.copy()
    frame_complete = True


def on_ble_line(line: str):
    """Process a complete line of BLE data (text format - kept for compatibility)."""
    global latest_matrix
    parse_ble_line(line.strip())


def start_ble_background_loop():
    """Run the async BLE stream in a background thread."""
    global ble_connected
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    async def run_ble_stream():
        """Stream BLE text notifications."""
        global ble_connected
        
        device = None
        
        # Try to find device by name using filter (same method as ble.py)
        if DEVICE_NAME:
            print(f"Scanning for BLE device: {DEVICE_NAME}...")
            def _match_name(d, _):
                return d and d.name == DEVICE_NAME
            device = await BleakScanner.find_device_by_filter(_match_name, timeout=10.0)
        
        # If not found by name, try scanning by service UUID
        if not device:
            print(f"Device '{DEVICE_NAME}' not found by name. Trying to scan by service UUID...")
            devices = await BleakScanner.discover(timeout=10.0, service_uuids=[UART_SERVICE_UUID])
            if devices:
                print(f"Found {len(devices)} device(s) with service {UART_SERVICE_UUID}:")
                for d in devices:
                    print(f"  - {d.name or 'Unknown'} ({d.address})")
                device = devices[0]  # Use first device found
        
        if device is None:
            print(f"\n❌ BLE device not found")
            print("\nTroubleshooting:")
            print("  1. Make sure the Arduino is powered on")
            print("  2. Check that the device is not connected to another device (phone, etc.)")
            print("  3. Try resetting the Arduino")
            print(f"  4. Verify the device name matches exactly: '{DEVICE_NAME}'")
            ble_connected = False
            return
        
        print(f"✓ Found device: {device.name or device.address}")
        print(f"  Address: {device.address}")
        print("Connecting...")
        
        # Binary frame assembler (like ble.py)
        payload_len = 4 + NUM_ROWS * NUM_COLS * 2  # 196 bytes: 4 (magic+id) + 96*2 (data)
        assembler = MagicFrameAssembler(payload_len, magic=0xBEEF)
        
        def _handler(sender, data: bytearray):
            nonlocal assembler
            try:
                # Assemble binary frames
                for payload in assembler.add_chunk(bytes(data)):
                    # Decode the binary frame into a matrix
                    frame_id, matrix = decode_frame_u16(
                        payload, 
                        min_v=-1.0, 
                        max_v=MAX_CLIP, 
                        rows=NUM_ROWS, 
                        cols=NUM_COLS
                    )
                    
                    # Apply inactive coordinate masking
                    for r, c in INACTIVE_COORDS:
                        matrix[r, c] = MAX_CLIP
                    
                    # Process the decoded matrix
                    on_ble_binary_frame(matrix)
            except Exception as e:
                print(f"Frame decoding error: {e}")
        
        try:
            async with BleakClient(device) as client:
                print(f"✓ Connected to {device.name or device.address}!")
                ble_connected = True
                await client.start_notify(UART_TX_CHAR_UUID, _handler)
                try:
                    while True:
                        await asyncio.sleep(1.0)
                finally:
                    await client.stop_notify(UART_TX_CHAR_UUID)
        except Exception as e:
            print(f"❌ BLE connection error: {e}")
            ble_connected = False
    
    loop.run_until_complete(run_ble_stream())


def main():
    """Main data collection loop."""
    global ble_connected, camera_running, pose_thread
    
    # Create data directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Connect to BLE device
    print("=" * 60)
    print("Foot Pressure Training Data Collection (BLE + Pose)")
    print("=" * 60)
    
    # Initialize pose detector
    print("\nInitializing MediaPipe pose detector...")
    if not initialize_pose_detector():
        print("⚠ Warning: Pose detection will be disabled. Continuing with foot sensor only...")
        pose_detector_available = False
    else:
        pose_detector_available = True
        # Start pose detection in background thread
        pose_thread = threading.Thread(target=run_pose_detection, daemon=True)
        pose_thread.start()
        # Give camera a moment to initialize
        time.sleep(1.0)
    
    # Start BLE connection in background thread
    ble_thread = threading.Thread(target=start_ble_background_loop, daemon=True)
    ble_thread.start()
    
    # Wait for connection and initial data
    print("\nWaiting for BLE connection...")
    connected = False
    for _ in range(30):  # Wait up to 15 seconds
        if ble_connected:
            # Check if we've received data
            if np.any(latest_matrix > 0):
                print("✓ Sensor data received!")
                connected = True
                break
        time.sleep(0.5)
    
    if not connected:
        print("\n❌ Failed to connect to BLE device or receive data.")
        print("Please check that the device is powered on and not connected to another device.")
        camera_running = False
        ble_connected = False
        return
    
    print("\n" + "=" * 60)
    print("Data Collection Interface")
    print("=" * 60)
    print(f"Each episode: {EPISODE_DURATION} seconds, {MATRICES_PER_EPISODE} matrices")
    print(f"Pose landmarks: {'Enabled' if pose_detector_available else 'Disabled'}")
    print(f"Classes: {', '.join(CLASSES)}")
    print("\nCommands:")
    print("  - Enter class name to record an episode")
    print("  - 'status' to see collection progress")
    print("  - 'quit' to exit")
    print("=" * 60)
    
    try:
        while True:
            # Show current status
            counts = count_episodes_per_class()
            print(f"\nCurrent collection status:")
            for class_label in CLASSES:
                print(f"  {class_label:15s}: {counts[class_label]:2d}/10 episodes")
            
            # Get user input
            user_input = input(f"\nEnter class name ({'/'.join(CLASSES)}) or command: ").strip().lower()
            
            if user_input == 'quit':
                break
            elif user_input == 'status':
                continue
            elif user_input not in CLASSES:
                print(f"Invalid input. Please enter one of: {', '.join(CLASSES)}")
                continue
            
            class_label = user_input
            episode_num = counts[class_label] + 1
            
            if episode_num > 10:
                print(f"Already collected 10 episodes for {class_label}. Skipping...")
                continue
            
            # Countdown
            print(f"\n{'='*60}")
            print(f"Recording episode {episode_num}/10 for class: {class_label}")
            print("Get ready...")
            for i in range(3, 0, -1):
                print(f"  {i}...")
                time.sleep(1)
            print("  GO!\n")
            
            # Collect episode
            try:
                matrices, pose_landmarks = collect_episode()
                
                if len(matrices) == MATRICES_PER_EPISODE:
                    # Save episode (with pose landmarks)
                    filepath = save_episode(matrices, pose_landmarks, class_label, episode_num)
                    print(f"✓ Saved to: {filepath}")
                    
                    # Show pose detection stats
                    if pose_detector_available:
                        valid_poses = np.sum([np.any(pl > 0) for pl in pose_landmarks])
                        print(f"  Pose detection: {valid_poses}/{len(pose_landmarks)} samples had valid poses")
                else:
                    print(f"⚠ Warning: Expected {MATRICES_PER_EPISODE} matrices, got {len(matrices)}")
                    retry = input("Save anyway? (y/n): ").strip().lower()
                    if retry == 'y':
                        filepath = save_episode(matrices, pose_landmarks, class_label, episode_num)
                        print(f"✓ Saved to: {filepath}")
                    else:
                        print("Episode discarded.")
            except KeyboardInterrupt:
                print("\n\nRecording interrupted. Episode discarded.")
            except Exception as e:
                print(f"\nError during recording: {e}")
                print("Episode discarded.")
    finally:
        # Disconnect BLE and stop pose detection
        ble_connected = False
        camera_running = False
        
        # Wait a moment for threads to clean up
        time.sleep(0.5)
        
        print("\n" + "=" * 60)
        print("Data collection complete!")
        print("=" * 60)
        
        # Final status
        counts = count_episodes_per_class()
        print("\nFinal collection status:")
        for class_label in CLASSES:
            print(f"  {class_label:15s}: {counts[class_label]:2d}/10 episodes")
        print()


if __name__ == "__main__":
    main()