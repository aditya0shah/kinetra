"""
Test script for foot pressure + pose landmark data collection.

This script simulates foot sensor data and collects real pose landmarks
to test the data collection pipeline and verify correct pairing.

Run this to test:
1. Pose detection is working
2. Data collection timing
3. Proper pairing of foot sensor + pose data
4. Data format matches classification.py output
"""

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

# === Configuration (matching classification.py) ===
NUM_ROWS = 12
NUM_COLS = 8
MAX_CLIP = 3700.0
EPISODE_DURATION = 5.0  # seconds
SAMPLING_RATE = 3.0  # Hz (matrices per second)
MATRICES_PER_EPISODE = int(EPISODE_DURATION * SAMPLING_RATE)  # 15

# MediaPipe Configuration
POSE_MODEL_PATH = "pose_landmarker.task"
CAMERA_INDEX = 0
NUM_POSE_LANDMARKS = 33

# Inactive coordinates (matching classification.py)
INACTIVE_COORDS = {
    (0, 0), (0, 1), (0, 7), (1, 0),
    (6, 7), (7, 7),
    (8, 6), (8, 7), (9, 6), (9, 7), (10, 6), (10, 7), (11, 6), (11, 7)
}

CLASSES = ['running', 'idle', 'tennis', 'baseball']
TEST_DATA_DIR = Path('data/test')

# Global state
latest_matrix = np.zeros((NUM_ROWS, NUM_COLS))
latest_pose_landmarks = None
pose_detector = None
camera_running = False
pose_thread = None
cap = None
sensor_sim_running = False


def is_active(r, c):
    """Check if a coordinate is active (not in inactive list)."""
    return (r, c) not in INACTIVE_COORDS


def generate_synthetic_foot_data(pattern="standing", time_step=0):
    """Generate synthetic foot sensor data for testing.
    
    Args:
        pattern: "standing", "tiptoe", "heel_pressure", "running", "idle", "tennis", "baseball"
        time_step: Current time step (for dynamic patterns)
    
    Returns:
        numpy array of shape (12, 8) with simulated pressure values
    """
    matrix = np.full((NUM_ROWS, NUM_COLS), MAX_CLIP)
    
    # Set inactive coordinates
    for r, c in INACTIVE_COORDS:
        matrix[r, c] = MAX_CLIP
    
    # Generate pattern-based pressure distribution
    if pattern == "standing":
        # Even pressure across middle of foot
        for r in range(3, 9):
            for c in range(2, 6):
                if is_active(r, c):
                    base_val = 2000.0
                    # Add slight variation
                    matrix[r, c] = base_val + np.random.normal(0, 200)
    
    elif pattern == "tiptoe":
        # High pressure at toes (rows 0-4)
        for r in range(0, 5):
            for c in range(2, 6):
                if is_active(r, c):
                    matrix[r, c] = 1500.0 + np.random.normal(0, 150)
        # Low pressure at heel
        for r in range(8, 12):
            for c in range(2, 6):
                if is_active(r, c):
                    matrix[r, c] = 3000.0 + np.random.normal(0, 200)
    
    elif pattern == "heel_pressure":
        # High pressure at heel (rows 8-11)
        for r in range(8, 12):
            for c in range(2, 6):
                if is_active(r, c):
                    matrix[r, c] = 1500.0 + np.random.normal(0, 150)
        # Low pressure at toes
        for r in range(0, 4):
            for c in range(2, 6):
                if is_active(r, c):
                    matrix[r, c] = 3000.0 + np.random.normal(0, 200)
    
    elif pattern == "running":
        # Simulate running pattern with foot strike
        # Alternating between heel strike and toe-off
        phase = (time_step % 4) / 4.0  # 0 to 1 cycle
        
        if phase < 0.3:  # Heel strike
            for r in range(8, 12):
                for c in range(2, 6):
                    if is_active(r, c):
                        matrix[r, c] = 1200.0 + np.random.normal(0, 200)
        elif phase < 0.7:  # Mid-stance
            for r in range(4, 8):
                for c in range(2, 6):
                    if is_active(r, c):
                        matrix[r, c] = 1800.0 + np.random.normal(0, 200)
        else:  # Toe-off
            for r in range(0, 5):
                for c in range(2, 6):
                    if is_active(r, c):
                        matrix[r, c] = 1400.0 + np.random.normal(0, 200)
    
    elif pattern == "idle":
        # Very light, even pressure
        for r in range(4, 8):
            for c in range(2, 6):
                if is_active(r, c):
                    matrix[r, c] = 2500.0 + np.random.normal(0, 100)
    
    elif pattern in ["tennis", "baseball"]:
        # Lateral movement patterns with more variation
        for r in range(3, 9):
            for c in range(1, 7):
                if is_active(r, c):
                    # Add some lateral bias
                    lateral_factor = abs(c - 3.5) / 3.5
                    base_val = 2000.0 - lateral_factor * 300
                    matrix[r, c] = base_val + np.random.normal(0, 250)
    
    # Clip values
    matrix = np.clip(matrix, 0, MAX_CLIP)
    
    return matrix


def initialize_pose_detector():
    """Initialize MediaPipe Pose Landmarker."""
    global pose_detector
    
    if not os.path.exists(POSE_MODEL_PATH):
        print(f"\n⚠ Warning: Pose model file '{POSE_MODEL_PATH}' not found.")
        print("Downloading pose_landmarker_heavy model...")
        try:
            import urllib.request
            url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
            print(f"Downloading from {url}...")
            urllib.request.urlretrieve(url, POSE_MODEL_PATH)
            print("✓ Download complete!")
        except Exception as e:
            print(f"❌ Failed to download: {e}")
            print("Please download manually and place it in the current directory.")
            return False
    
    try:
        base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            output_segmentation_masks=False,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )
        pose_detector = vision.PoseLandmarker.create_from_options(options)
        print("✓ Pose detector initialized!")
        return True
    except Exception as e:
        print(f"❌ Failed to initialize pose detector: {e}")
        return False


def extract_pose_landmarks(detection_result):
    """Extract pose landmarks from MediaPipe detection result."""
    if not detection_result.pose_landmarks or len(detection_result.pose_landmarks) == 0:
        return None
    
    pose_landmarks = detection_result.pose_landmarks[0]
    landmarks = np.zeros((NUM_POSE_LANDMARKS, 3))
    for idx, landmark in enumerate(pose_landmarks):
        landmarks[idx] = [landmark.x, landmark.y, landmark.z]
    
    return landmarks


def run_pose_detection():
    """Run pose detection continuously in a background thread."""
    global latest_pose_landmarks, camera_running, cap
    
    if pose_detector is None:
        print("⚠ Pose detector not initialized. Skipping pose detection.")
        return
    
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
            if not ret:
                break
            
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            detection_result = pose_detector.detect(mp_image)
            
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


def simulate_sensor_data(pattern="standing"):
    """Simulate foot sensor data generation at correct sampling rate."""
    global latest_matrix, sensor_sim_running
    
    sensor_sim_running = True
    time_step = 0
    
    while sensor_sim_running:
        # Generate data at sampling rate
        interval = 1.0 / SAMPLING_RATE
        time.sleep(interval)
        
        # Generate synthetic matrix
        matrix = generate_synthetic_foot_data(pattern, time_step)
        latest_matrix = matrix
        time_step += 1


def collect_test_episode(pattern="standing"):
    """Collect one test episode with simulated foot data and real pose landmarks."""
    global latest_matrix, latest_pose_landmarks
    
    matrices = []
    pose_landmarks_list = []
    timestamps = []  # Track exact timestamps for verification
    
    start_time = time.time()
    interval = 1.0 / SAMPLING_RATE
    next_sample_time = start_time + interval
    
    print(f"\nRecording test episode... (collecting {MATRICES_PER_EPISODE} samples)")
    print(f"Pattern: {pattern}")
    
    while len(matrices) < MATRICES_PER_EPISODE:
        current_time = time.time()
        
        if current_time >= next_sample_time:
            # Generate synthetic foot data
            current_matrix = generate_synthetic_foot_data(pattern, len(matrices))
            
            # Capture pose landmarks simultaneously
            capture_time = time.time()
            if latest_pose_landmarks is not None:
                pose_data = latest_pose_landmarks.copy()
            else:
                pose_data = np.zeros((NUM_POSE_LANDMARKS, 3))
            
            matrices.append(current_matrix.copy())
            pose_landmarks_list.append(pose_data.copy())
            timestamps.append(capture_time - start_time)
            
            elapsed = current_time - start_time
            pose_status = "✓" if latest_pose_landmarks is not None else "⚠"
            print(f"  [{len(matrices)}/{MATRICES_PER_EPISODE}] Collected at {elapsed:.2f}s {pose_status}", end='\r')
            
            next_sample_time += interval
        
        time.sleep(0.001)  # Small sleep
    
    print(f"\n✓ Collected {len(matrices)} matrices and {len(pose_landmarks_list)} pose landmark sets")
    
    matrices_array = np.array(matrices)
    pose_landmarks_array = np.array(pose_landmarks_list)
    
    return matrices_array, pose_landmarks_array, timestamps


def save_test_episode(matrices, pose_landmarks, class_label, episode_num, timestamps=None):
    """Save test episode data (same format as classification.py)."""
    class_dir = TEST_DATA_DIR / class_label
    class_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{class_label}_ep{episode_num:02d}_{timestamp}.npz"
    filepath = class_dir / filename
    
    save_dict = {
        'matrices': matrices,
        'pose_landmarks': pose_landmarks,
        'class_label': class_label,
        'episode_num': episode_num,
        'timestamp': timestamp,
        'sampling_rate': SAMPLING_RATE,
        'episode_duration': EPISODE_DURATION,
        'num_pose_landmarks': NUM_POSE_LANDMARKS,
        'test_mode': True  # Flag to indicate this is test data
    }
    
    if timestamps is not None:
        save_dict['timestamps'] = np.array(timestamps)
    
    np.savez_compressed(filepath, **save_dict)
    
    return filepath


def verify_episode(filepath):
    """Verify and display information about a collected episode."""
    print(f"\n{'='*60}")
    print(f"Verifying episode: {filepath.name}")
    print(f"{'='*60}")
    
    data = np.load(filepath, allow_pickle=True)
    
    matrices = data['matrices']
    pose_landmarks = data['pose_landmarks']
    
    print(f"\nData Shapes:")
    print(f"  Foot sensor matrices: {matrices.shape}")
    print(f"  Pose landmarks: {pose_landmarks.shape}")
    
    print(f"\nFoot Sensor Data:")
    print(f"  Min value: {matrices.min():.1f}")
    print(f"  Max value: {matrices.max():.1f}")
    print(f"  Mean value: {matrices.mean():.1f}")
    print(f"  Shape check: {'✓' if matrices.shape == (MATRICES_PER_EPISODE, NUM_ROWS, NUM_COLS) else '✗'}")
    
    print(f"\nPose Landmarks:")
    valid_poses = np.sum([np.any(pl > 0) for pl in pose_landmarks])
    print(f"  Valid poses: {valid_poses}/{len(pose_landmarks)}")
    print(f"  Shape check: {'✓' if pose_landmarks.shape == (MATRICES_PER_EPISODE, NUM_POSE_LANDMARKS, 3) else '✗'}")
    
    if valid_poses > 0:
        # Show some landmark statistics
        valid_mask = np.any(pose_landmarks > 0, axis=2)
        valid_landmarks = pose_landmarks[valid_mask]
        print(f"  X range: [{valid_landmarks[:, 0].min():.3f}, {valid_landmarks[:, 0].max():.3f}]")
        print(f"  Y range: [{valid_landmarks[:, 1].min():.3f}, {valid_landmarks[:, 1].max():.3f}]")
        print(f"  Z range: [{valid_landmarks[:, 2].min():.3f}, {valid_landmarks[:, 2].max():.3f}]")
    
    print(f"\nMetadata:")
    print(f"  Class: {data['class_label']}")
    print(f"  Episode: {data['episode_num']}")
    print(f"  Sampling rate: {data['sampling_rate']} Hz")
    print(f"  Episode duration: {data['episode_duration']} s")
    print(f"  Test mode: {data.get('test_mode', False)}")
    
    # Check pairing
    print(f"\nPairing Verification:")
    print(f"  Same number of samples: {'✓' if len(matrices) == len(pose_landmarks) else '✗'}")
    
    if 'timestamps' in data:
        timestamps = data['timestamps']
        intervals = np.diff(timestamps)
        expected_interval = 1.0 / SAMPLING_RATE
        print(f"  Timestamp intervals: mean={intervals.mean():.3f}s, expected={expected_interval:.3f}s")
        print(f"  Interval consistency: {'✓' if np.allclose(intervals, expected_interval, atol=0.1) else '✗'}")
    
    print(f"{'='*60}\n")


def main():
    """Main test function."""
    global camera_running, pose_thread, sensor_sim_running
    
    print("=" * 60)
    print("Foot Pressure + Pose Data Collection TEST")
    print("=" * 60)
    print("\nThis script tests:")
    print("  1. Pose detection with camera")
    print("  2. Simulated foot sensor data generation")
    print("  3. Synchronized data collection")
    print("  4. Data format matching classification.py")
    print("=" * 60)
    
    # Initialize pose detector
    print("\nInitializing MediaPipe pose detector...")
    if not initialize_pose_detector():
        print("⚠ Warning: Pose detection will be disabled.")
        pose_available = False
    else:
        pose_available = True
        pose_thread = threading.Thread(target=run_pose_detection, daemon=True)
        pose_thread.start()
        time.sleep(1.0)  # Give camera time to initialize
    
    print("\n" + "=" * 60)
    print("Test Data Collection Interface")
    print("=" * 60)
    print(f"Each episode: {EPISODE_DURATION} seconds, {MATRICES_PER_EPISODE} samples")
    print(f"Pose detection: {'Enabled' if pose_available else 'Disabled'}")
    print(f"Foot sensor: Simulated (TEST MODE)")
    print(f"Classes: {', '.join(CLASSES)}")
    print("\nCommands:")
    print("  - Enter class name to record a test episode")
    print("  - 'verify' to verify last episode")
    print("  - 'quit' to exit")
    print("=" * 60)
    
    last_filepath = None
    
    try:
        while True:
            user_input = input(f"\nEnter class name ({'/'.join(CLASSES)}) or command: ").strip().lower()
            
            if user_input == 'quit':
                break
            elif user_input == 'verify':
                if last_filepath and last_filepath.exists():
                    verify_episode(last_filepath)
                else:
                    print("No episode to verify. Record one first.")
                continue
            elif user_input not in CLASSES:
                print(f"Invalid input. Please enter one of: {', '.join(CLASSES)}")
                continue
            
            class_label = user_input
            
            # Countdown
            print(f"\n{'='*60}")
            print(f"Recording test episode for class: {class_label}")
            print("Get ready...")
            for i in range(3, 0, -1):
                print(f"  {i}...")
                time.sleep(1)
            print("  GO!\n")
            
            # Collect episode
            try:
                matrices, pose_landmarks, timestamps = collect_test_episode(pattern=class_label)
                
                # Save episode
                episode_num = 1  # For testing, just use 1
                filepath = save_test_episode(matrices, pose_landmarks, class_label, episode_num, timestamps)
                last_filepath = filepath
                
                print(f"✓ Saved to: {filepath}")
                
                # Auto-verify
                verify_episode(filepath)
                
            except KeyboardInterrupt:
                print("\n\nRecording interrupted.")
            except Exception as e:
                print(f"\nError during recording: {e}")
                import traceback
                traceback.print_exc()
    
    finally:
        camera_running = False
        sensor_sim_running = False
        time.sleep(0.5)
        
        print("\n" + "=" * 60)
        print("Test complete!")
        print("=" * 60)
        print(f"\nTest data saved to: {TEST_DATA_DIR}")
        print("You can verify the data format matches classification.py output.")


if __name__ == "__main__":
    main()
