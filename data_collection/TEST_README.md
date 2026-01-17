# Data Collection Testing

This directory contains test scripts to verify the data collection pipeline works correctly without requiring the foot sensor hardware.

## Files

- **`test_data_collection.py`** - Main test script that simulates foot sensor data and collects real pose landmarks
- **`verify_data_format.py`** - Verification script to check data format consistency
- **`classification.py`** - Original production script (DO NOT MODIFY for testing)

## Quick Start

### 1. Test Data Collection

Run the test script to collect paired foot sensor + pose data:

```bash
python data_collection/test_data_collection.py
```

**What it does:**
- Simulates foot sensor data (no hardware needed)
- Uses your webcam for real pose detection
- Collects synchronized data pairs
- Saves to `data/test/` directory

**During collection:**
- Stand in front of your camera
- The script will collect pose landmarks from your webcam
- Foot sensor data is automatically simulated
- Each episode is 5 seconds (15 samples at 3 Hz)

### 2. Verify Data Format

After collecting test data, verify the format:

```bash
# Verify all test data
python data_collection/verify_data_format.py

# Verify a specific file
python data_collection/verify_data_format.py data/test/running/running_ep01_20241215_143022.npz
```

**What it checks:**
- Data shapes match expected format
- Value ranges are correct
- Foot sensor and pose data are properly paired
- Metadata is complete

## Test Data Structure

Test data is saved in the same format as production data:

```
data/test/
├── running/
│   └── running_ep01_20241215_143022.npz
├── idle/
│   └── idle_ep01_20241215_143100.npz
└── ...
```

Each `.npz` file contains:
- `matrices`: Simulated foot sensor data (15, 12, 8)
- `pose_landmarks`: Real pose landmarks from camera (15, 33, 3)
- Metadata: class_label, episode_num, timestamps, etc.

## Testing Workflow

1. **Test pose detection:**
   ```bash
   python data_collection/test_data_collection.py
   # Record a few episodes, verify pose is detected (✓ symbol)
   ```

2. **Verify pairing:**
   ```bash
   python data_collection/verify_data_format.py
   # Check that foot sensor and pose data are paired correctly
   ```

3. **Compare with production:**
   - After collecting real data with `classification.py`
   - Run `verify_data_format.py` to compare formats
   - Ensure both produce identical data structures

## What Gets Tested

✅ **Pose Detection**
- Camera initialization
- MediaPipe pose landmarker
- Real-time pose tracking

✅ **Data Collection**
- Sampling rate (3 Hz)
- Episode duration (5 seconds)
- Sample count (15 per episode)

✅ **Data Pairing**
- Synchronized capture of foot sensor + pose
- Same number of samples for both
- Timestamp verification

✅ **Data Format**
- Correct shapes and dimensions
- Value ranges
- Metadata completeness
- Compatibility with training pipeline

## Notes

- **Test data is saved separately** (`data/test/`) from real data (`data/raw/`)
- **Foot sensor data is simulated** - patterns vary by class (standing, running, etc.)
- **Pose data is real** - captured from your webcam
- **Test mode flag** - Test files include `test_mode: True` in metadata

## Troubleshooting

**Pose not detected:**
- Make sure you're visible to the camera
- Check camera permissions
- Ensure good lighting
- Try moving closer to camera

**Data format errors:**
- Run `verify_data_format.py` to see specific issues
- Check that MediaPipe model downloaded correctly
- Verify numpy version compatibility

**Camera issues:**
- Try changing `CAMERA_INDEX` in the script (0, 1, 2, etc.)
- Check that no other app is using the camera
- On macOS, grant camera permissions in System Preferences

## Next Steps

After testing:
1. Verify data format matches expected structure
2. Test with real foot sensor when available
3. Use collected data to verify training pipeline
4. Compare test vs real data formats
