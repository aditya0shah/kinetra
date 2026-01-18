# Skeleton Frame to VLM Integration

This integration allows you to pass live skeleton visualization frames from the pressure sensor data to the Overshoot Vision Language Model (VLM) for analysis.

## Architecture

```
Pressure Sensor (BLE) → Backend (Flask) → Skeleton Model → 3D Visualization → Base64 PNG
                                                                                     ↓
Frontend (React) ← WebSocket ← frame_processed event ← Backend
                   ↓
              VLM Analysis (Overshoot Vision)
```

## Components

### 1. Backend: `models/live_skeleton_frame_generator.py`

**Purpose**: Convert pressure matrices to 3D skeleton poses and render them as base64-encoded PNG images.

**Key Class**: `SkeletonFrameGenerator`
- `add_pressure_frame(matrix)`: Add pressure data to buffer
- `generate_pose()`: Generate 33-landmark pose from buffered frames
- `render_pose_to_frame(pose)`: Convert pose to base64 PNG
- `process_and_render(matrix)`: Complete pipeline in one call

**Usage**:
```python
from models.live_skeleton_frame_generator import get_generator

# Get singleton instance
generator = get_generator(model_path="best_skeleton_model.pth")

# Process frame
base64_image = generator.process_and_render(pressure_matrix)
if base64_image:
    # Send to frontend via WebSocket
    emit('frame_processed', {'skeleton_frame': base64_image})
```

### 2. Backend: `backend/app.py` Integration

The skeleton frame generator is automatically initialized when the Flask app starts:

```python
# In create_app():
skeleton_generator = get_generator(model_path="best_skeleton_model.pth")

@socketio.on('pressure_frame')
def on_pressure_frame(data):
    # ... existing code ...
    
    # Generate skeleton frame
    if skeleton_generator:
        skeleton_frame_base64 = skeleton_generator.process_and_render(matrix_array)
        if skeleton_frame_base64:
            response_data['skeleton_frame'] = skeleton_frame_base64
    
    emit('frame_processed', response_data)
```

### 3. Frontend: `services/overshootVision.js`

**Purpose**: Manage Overshoot Vision VLM and send skeleton frames for analysis.

**Functions**:
- `startOvershootVision({ prompt, onResult })`: Initialize VLM with custom prompt
- `sendSkeletonFrameToVLM(base64Frame)`: Convert base64 to image and pass to VLM
- `stopOvershootVision()`: Clean up VLM instance

**Usage**:
```javascript
import { startOvershootVision, sendSkeletonFrameToVLM } from '../services/overshootVision';

// Start VLM
await startOvershootVision({
  prompt: 'Analyze the workout form and provide feedback on technique.',
  onResult: (result) => {
    console.log('VLM Analysis:', result);
  }
});

// When skeleton frame arrives via WebSocket
socket.on('frame_processed', (data) => {
  if (data.skeleton_frame) {
    sendSkeletonFrameToVLM(data.skeleton_frame);
  }
});
```

### 4. Frontend: `pages/EpisodeDetail.js` Integration

The page automatically receives skeleton frames and passes them to the VLM when active:

```javascript
// In WebSocket handler:
const handler = (data) => {
  // Handle skeleton frame if VLM is active
  if (data && data.skeleton_frame && isVisionActive) {
    sendSkeletonFrameToVLM(data.skeleton_frame);
  }
};
```

## Workflow

1. **User starts workout**: BLE device streams pressure data
2. **Backend receives data**: Flask receives pressure frames via WebSocket
3. **Skeleton generation**: Frame generator converts pressure → pose → PNG
4. **WebSocket emission**: Backend emits `frame_processed` with `skeleton_frame` field
5. **Frontend receives**: React component gets skeleton frame
6. **VLM analysis**: If VLM is active, frame is sent to Overshoot Vision
7. **Results display**: VLM analysis results shown to user

## Configuration

### Backend Requirements

Add to `backend/requirements.txt`:
```
torch>=2.0.0
numpy>=1.24.0
matplotlib>=3.7.0
Pillow>=10.0.0
```

Install:
```bash
cd backend
pip install torch numpy matplotlib Pillow
```

### Model File

Ensure `best_skeleton_model.pth` exists in project root:
```
kinetra/
├── best_skeleton_model.pth  ← Required
├── backend/
├── models/
└── frontend/
```

### Frontend Requirements

Already configured in your project with `@overshoot/sdk`.

## Testing

### 1. Test Skeleton Frame Generator (Backend)

```python
# Test script: test_skeleton_generator.py
from models.live_skeleton_frame_generator import get_generator
import numpy as np

generator = get_generator()

# Create test pressure matrix (12x8)
test_matrix = np.random.rand(12, 8) * 3700

# Process 15 frames to fill buffer
for i in range(15):
    result = generator.process_and_render(test_matrix)
    if result:
        print(f"Generated frame! Length: {len(result)} chars")
        break
```

### 2. Test WebSocket Integration

```javascript
// In browser console during workout:
socket.on('frame_processed', (data) => {
  if (data.skeleton_frame) {
    console.log('Skeleton frame received!', data.skeleton_frame.substring(0, 50));
  }
});
```

### 3. Test VLM Integration

1. Start a workout
2. Enable AI Vision (toggle button)
3. Check console for: `>>> Received skeleton frame, sending to VLM`
4. VLM results should appear in `visionResult` state

## Customization

### Change VLM Prompt

Edit the prompt in `EpisodeDetail.js`:

```javascript
await startOvershootVision({
  prompt: 'Your custom prompt here. Analyze form, count reps, detect issues, etc.',
  onResult: (result) => { /* ... */ }
});
```

### Adjust Frame Rate

Control how often frames are sent to VLM:

```javascript
let frameCount = 0;
if (data.skeleton_frame && isVisionActive) {
  frameCount++;
  if (frameCount % 5 === 0) { // Only every 5th frame
    sendSkeletonFrameToVLM(data.skeleton_frame);
  }
}
```

### Change Visualization Style

Edit `live_skeleton_frame_generator.py`:

```python
def render_pose_to_frame(self, pose):
    # Modify figure size
    self.fig = plt.figure(figsize=(10, 10))
    
    # Change colors
    self.ax.scatter(xs[idx], ys[idx], zs[idx], c="blue", s=100)
    self.ax.plot(..., color="red", linewidth=3)
    
    # Adjust DPI for quality/size tradeoff
    self.fig.savefig(buf, format='png', dpi=150)
```

## Troubleshooting

### No skeleton frames appearing

1. Check model file exists: `ls -la best_skeleton_model.pth`
2. Check backend logs for: `✓ Skeleton frame generator initialized`
3. Verify 15+ frames received (buffer requirement)

### VLM not receiving frames

1. Ensure VLM is active: check `isVisionActive` state
2. Check browser console for WebSocket errors
3. Verify `skeleton_frame` field in `frame_processed` event

### Performance issues

1. Reduce frame rate (see customization above)
2. Lower DPI in `render_pose_to_frame`
3. Use GPU if available: `get_generator(device="cuda")`

## Future Enhancements

- [ ] Add frame caching to reduce regeneration
- [ ] Support multiple visualization angles
- [ ] Add temporal analysis (compare frames over time)
- [ ] Integrate with AI agent for voice feedback
- [ ] Save skeleton frames to database for replay
