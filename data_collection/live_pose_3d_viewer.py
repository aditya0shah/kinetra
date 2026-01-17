import cv2
import mediapipe as mp
# Explicitly import solutions to avoid the AttributeError
import numpy as np
import time
import matplotlib.pyplot as plt
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Now this will work
# Hardcoded connections to bypass 'import solutions'
MP_POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20), (11, 23),
    (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28), (27, 29),
    (28, 30), (29, 31), (30, 32), (27, 31), (28, 32)
]# --- CONFIGURATION ---
model_path = 'data_collection/pose_landmarker_heavy.task'
video_source = 0 

# Initialize MediaPipe
base_options = python.BaseOptions(model_asset_path=model_path)
options = vision.PoseLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.VIDEO
)

# Initialize Matplotlib for 3D visualization
plt.ion() # Interactive mode ON
fig = plt.figure(figsize=(8, 8))
ax = fig.add_subplot(111, projection='3d')

# Pose connection mapping (which landmarks to connect with lines)

def update_3d_plot(world_landmarks):
    ax.clear()
    
    # Set plot limits (in meters)
    ax.set_xlim3d(-1, 1)
    ax.set_ylim3d(-1, 1)
    ax.set_zlim3d(-1, 1)
    ax.set_xlabel('X (meters)')
    ax.set_ylabel('Z (meters)')
    ax.set_zlabel('Y (meters)') # MediaPipe Y is up/down
    
    if not world_landmarks:
        plt.draw()
        plt.pause(0.001)
        return

    # Extract coordinates
    landmarks = world_landmarks[0]
    xs = [-lm.x for lm in landmarks] # Invert X for mirroring
    ys = [-lm.z for lm in landmarks] # Use Z as the "depth" axis in plot
    zs = [-lm.y for lm in landmarks] # Invert Y because MP Y-down is negative in 3D space

    # Draw points
    ax.scatter(xs, ys, zs, c='r', s=20)

    # Draw connections
    for connection in MP_POSE_CONNECTIONS:
        start_idx = connection[0]
        end_idx = connection[1]
        ax.plot([xs[start_idx], xs[end_idx]], 
                [ys[start_idx], ys[end_idx]], 
                [zs[start_idx], zs[end_idx]], color='blue')

    plt.draw()
    plt.pause(0.001)

# --- MAIN LOOP ---
cap = cv2.VideoCapture(video_source)

with vision.PoseLandmarker.create_from_options(options) as detector:
    while cap.isOpened():
        success, frame = cap.read()
        if not success: break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        timestamp = int(time.time() * 1000)
        result = detector.detect_for_video(mp_image, timestamp)

        # Update the 3D Plot
        update_3d_plot(result.pose_world_landmarks)

        # Show the standard 2D webcam feed
        cv2.imshow('Webcam Feed (Press Q to Exit)', frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
plt.close()