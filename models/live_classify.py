"""
Live sport classification script using trained SportClassifier model.

This script loads a trained model and performs real-time classification on:
- BLE streaming data from foot pressure sensor, OR
- Pre-recorded .npz files for testing

Usage:
    # Classify from BLE stream
    python models/live_classify.py --model-path models/checkpoints/best_model.pth --mode ble --device-name "BLE_Test"
    
    # Classify from saved .npz file (testing)
    python models/live_classify.py --model-path models/checkpoints/best_model.pth --mode file --input data/test/idle/idle_ep01_*.npz
"""

import torch
import numpy as np
import argparse
import time
from pathlib import Path
from collections import deque
import sys
from typing import Optional

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from models.sport_classifier import SportClassifier, load_model
from backend.decode import decode_frame_u16
from backend.ble import MagicFrameAssembler
from bleak import BleakClient, BleakScanner
import asyncio
import threading

# BLE Configuration
UART_TX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
NUM_ROWS = 12
NUM_COLS = 8
MAX_CLIP = 3700.0
SEQUENCE_LENGTH = 15  # Model expects 15 timesteps

# Inactive coordinates (should be set to MAX_CLIP)
INACTIVE_COORDS = {
    (0, 0), (0, 1), (0, 7), (1, 0),
    (6, 7), (7, 7),
    (8, 6), (8, 7), (9, 6), (9, 7), (10, 6), (10, 7), (11, 6), (11, 7)
}


class LiveClassifier:
    """Real-time sport classifier using sliding window of pressure frames."""
    
    def __init__(self, model_path: str, device: str = 'cpu', max_clip: float = MAX_CLIP):
        """
        Initialize live classifier.
        
        Args:
            model_path: Path to saved model checkpoint
            device: Device to run inference on ('cuda' or 'cpu')
            max_clip: Maximum pressure value for normalization
        """
        print(f"Loading model from {model_path}...")
        model, _, _, self.labels_map, checkpoint = load_model(model_path, device=device)
        model.eval()  # Set to evaluation mode
        
        self.model = model
        self.device = device
        self.max_clip = max_clip
        
        # Reverse labels_map to get class names from indices
        self.idx_to_class = {v: k for k, v in self.labels_map.items()}
        
        # Sliding window buffer for frames (stores last 15 frames)
        self.frame_buffer = deque(maxlen=SEQUENCE_LENGTH)
        
        print(f"✓ Model loaded successfully!")
        print(f"  Classes: {list(self.labels_map.keys())}")
        print(f"  Device: {device}")
        print("-" * 60)
    
    def preprocess_matrix(self, matrix: np.ndarray) -> np.ndarray:
        """
        Preprocess a single pressure matrix to match training preprocessing.
        
        Args:
            matrix: Raw pressure matrix (12, 8) with values in [0, MAX_CLIP]
        
        Returns:
            Preprocessed matrix (12, 8) with values in [0, 1]
        """
        # Copy to avoid modifying original
        processed = matrix.copy().astype(np.float32)
        
        # Apply inactive coordinate masking
        for r, c in INACTIVE_COORDS:
            processed[r, c] = MAX_CLIP
        
        # Invert: 3700 (no pressure) -> 0.0, 0 (max pressure) -> 1.0
        processed = (self.max_clip - processed) / self.max_clip
        processed = np.clip(processed, 0, 1)
        
        return processed
    
    def add_frame(self, matrix: np.ndarray) -> Optional[dict]:
        """
        Add a new frame to the buffer and classify if buffer is full.
        
        Args:
            matrix: Pressure matrix (12, 8)
        
        Returns:
            Classification result dict with 'class', 'confidence', 'probabilities', or None if buffer not full
        """
        # Preprocess the frame
        processed = self.preprocess_matrix(matrix)
        
        # Add to buffer
        self.frame_buffer.append(processed)
        
        # Need 15 frames before we can classify
        if len(self.frame_buffer) < SEQUENCE_LENGTH:
            return None
        
        # Convert buffer to tensor: (1, 15, 1, 12, 8)
        sequence = np.stack(list(self.frame_buffer), axis=0)  # (15, 12, 8)
        sequence = torch.tensor(sequence, dtype=torch.float32).unsqueeze(0).unsqueeze(2)  # (1, 15, 1, 12, 8)
        sequence = sequence.to(self.device)
        
        # Run inference
        with torch.no_grad():
            logits = self.model(sequence)  # (1, num_classes)
            probabilities = torch.softmax(logits, dim=1)  # (1, num_classes)
            confidence, predicted_idx = torch.max(probabilities, dim=1)
        
        # Convert to Python types
        predicted_idx = predicted_idx.item()
        confidence = confidence.item()
        probs = probabilities[0].cpu().numpy()
        
        # Get class name
        predicted_class = self.idx_to_class[predicted_idx]
        
        # Build probability dict
        prob_dict = {self.idx_to_class[i]: float(probs[i]) for i in range(len(self.idx_to_class))}
        
        return {
            'class': predicted_class,
            'confidence': confidence,
            'probabilities': prob_dict,
            'index': predicted_idx
        }
    
    def reset_buffer(self):
        """Clear the frame buffer (useful for starting a new episode)."""
        self.frame_buffer.clear()


def classify_from_file(classifier: LiveClassifier, filepath: Path):
    """Classify from a saved .npz file (for testing)."""
    print(f"Loading data from {filepath}...")
    data = np.load(filepath)
    matrices = data['matrices']  # (15, 12, 8)
    
    print(f"Classifying sequence of {len(matrices)} frames...")
    print("-" * 60)
    
    # Add each frame and classify
    results = []
    for i, matrix in enumerate(matrices):
        result = classifier.add_frame(matrix)
        if result:
            results.append(result)
            print(f"Frame {i+1:2d}/15 | Class: {result['class']:10s} | "
                  f"Confidence: {result['confidence']:.2%} | "
                  f"Probs: {', '.join(f'{k}={v:.2%}' for k, v in result['probabilities'].items())}")
    
    # Final classification (after all frames)
    if results:
        final_result = results[-1]
        print("\n" + "=" * 60)
        print(f"FINAL PREDICTION: {final_result['class'].upper()}")
        print(f"Confidence: {final_result['confidence']:.2%}")
        print("=" * 60)
        
        # Show true label if available
        if 'class_label' in data:
            true_label = str(data['class_label'])
            print(f"True label: {true_label}")
            match = "✓" if final_result['class'] == true_label else "✗"
            print(f"Match: {match}")


async def classify_from_ble(classifier: LiveClassifier, device_name: str, sampling_rate: float = 3.0):
    """
    Classify from BLE stream in real-time.
    
    Args:
        classifier: LiveClassifier instance
        device_name: BLE device name to connect to
        sampling_rate: Expected frames per second (for display purposes)
    """
    print(f"Scanning for BLE device: {device_name}...")
    
    # Find device
    device = None
    devices = await BleakScanner.discover(timeout=10.0)
    for d in devices:
        if device_name.lower() in (d.name or "").lower():
            device = d
            break
    
    if device is None:
        print(f"❌ Device '{device_name}' not found!")
        print("Available devices:")
        for d in devices:
            print(f"  - {d.name or d.address}")
        return
    
    print(f"✓ Found device: {device.name or device.address}")
    
    # Frame assembler
    payload_len = 4 + NUM_ROWS * NUM_COLS * 2  # 196 bytes
    assembler = MagicFrameAssembler(payload_len, magic=0xBEEF)
    
    frame_count = 0
    last_print_time = time.time()
    print_interval = 1.0  # Print prediction every N seconds
    
    def _handler(sender, data: bytearray):
        nonlocal frame_count, last_print_time
        
        try:
            # Assemble binary frames
            for payload in assembler.add_chunk(bytes(data)):
                # Decode frame
                frame_id, matrix = decode_frame_u16(
                    payload,
                    min_v=-1.0,
                    max_v=MAX_CLIP,
                    rows=NUM_ROWS,
                    cols=NUM_COLS
                )
                
                # Add frame and classify
                result = classifier.add_frame(matrix)
                frame_count += 1
                
                # Print prediction periodically
                current_time = time.time()
                if result and (current_time - last_print_time) >= print_interval:
                    # Clear line and print
                    print(f"\rFrame {frame_count:4d} | Class: {result['class']:10s} | "
                          f"Confidence: {result['confidence']:6.2%} | "
                          f"Top probs: {', '.join(f'{k}={v:.1%}' for k, v in sorted(result['probabilities'].items(), key=lambda x: x[1], reverse=True)[:2])}",
                          end='', flush=True)
                    last_print_time = current_time
                    
        except Exception as e:
            print(f"\n❌ Error processing frame: {e}")
    
    try:
        async with BleakClient(device) as client:
            print(f"✓ Connected! Starting classification...")
            print("Press Ctrl+C to stop\n")
            
            await client.start_notify(UART_TX_CHAR_UUID, _handler)
            
            # Keep running until interrupted
            try:
                while True:
                    await asyncio.sleep(1.0)
            except KeyboardInterrupt:
                print("\n\nStopping...")
            finally:
                await client.stop_notify(UART_TX_CHAR_UUID)
                
    except Exception as e:
        print(f"❌ BLE connection error: {e}")


def main():
    parser = argparse.ArgumentParser(description='Live sport classification')
    parser.add_argument('--model-path', type=str, required=True,
                        help='Path to trained model checkpoint (.pth file)')
    parser.add_argument('--mode', type=str, choices=['ble', 'file'], default='file',
                        help='Input mode: ble (real-time BLE) or file (pre-recorded .npz)')
    parser.add_argument('--input', type=str,
                        help='Input file path (for file mode) or glob pattern')
    parser.add_argument('--device-name', type=str, default='BLE_Test',
                        help='BLE device name (for ble mode)')
    parser.add_argument('--device', type=str, default='cuda', choices=['cuda', 'cpu'],
                        help='Device for model inference')
    parser.add_argument('--max-clip', type=float, default=3700.0,
                        help='Maximum pressure value for normalization')
    
    args = parser.parse_args()
    
    # Set device
    if args.device == 'cuda' and not torch.cuda.is_available():
        print("⚠️ CUDA not available, using CPU")
        args.device = 'cpu'
    
    # Load classifier
    model_path = Path(args.model_path)
    if not model_path.exists():
        print(f"❌ Model file not found: {model_path}")
        return
    
    classifier = LiveClassifier(str(model_path), device=args.device, max_clip=args.max_clip)
    
    # Run classification based on mode
    if args.mode == 'file':
        if not args.input:
            print("❌ --input required for file mode")
            return
        
        # Find files matching pattern
        input_path = Path(args.input)
        if '*' in args.input:
            files = list(input_path.parent.glob(input_path.name))
        else:
            files = [input_path]
        
        if not files:
            print(f"❌ No files found matching: {args.input}")
            return
        
        # Classify each file
        for filepath in files:
            if filepath.suffix == '.npz':
                classify_from_file(classifier, filepath)
                classifier.reset_buffer()  # Reset for next file
                print()
    
    elif args.mode == 'ble':
        # Run async BLE classification
        asyncio.run(classify_from_ble(classifier, args.device_name))


if __name__ == '__main__':
    main()
