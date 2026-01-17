# Kinetra Frontend

This React frontend provides wearable exercise visualizations powered by a Python Flask backend. Data is captured from an ESP32 Feather board and fed to the backend where an AI model performs inference and returns:

- Exercise class label
- 3D keypoints for the skeleton visualizer
- Pressure matrices over time for the foot heatmap

## Architecture

- Frontend: Create React App (React), Three.js via React Three Fiber (3D), Canvas-based 2D heatmap
- Backend (expected): Flask server exposing REST or streaming endpoints
- Data Source: ESP32 feeds pressure frames to Flask; inference + keypoints computed server-side

## Frontend Data Interfaces

- Pressure Frames (preferred):
	- `frames: Array<Array<number>>` where each frame is a 2D grid of pressure values in `[0..100]`.
	- `-1` values indicate no sensor at that cell (used to shape the foot).

- Nodes-based (fallback):
	- `[{ id, gridX, gridY, data: [{ pressure }] }]` or with normalized `position { x:0..100, y:0..100 }`.
	- The frontend bins positions into a grid if `gridX/gridY` are missing.

- Skeleton Keypoints:
	- `[{ id, x, y, z, confidence }, ...]` for the current frame. See `src/utils/skeleton.js` for edges.

## Backend Endpoints (expected)

Configure the base URL via `.env`:

```bash
REACT_APP_BACKEND_URL=http://localhost:5000
```

Endpoints used by the frontend (`src/config.js`):

- `GET /api/pressure/latest` → returns latest pressure frame
- `GET /api/inference/latest` → returns latest classification label
- `GET /api/skeleton/latest` → returns latest 3D keypoints
- `GET /api/pressure/stream` → optional SSE/WebSocket stream (server-dependent)

## Key Files

- `src/components/FootPressureHeatmap.js` → 2D grid heatmap; treats `-1` as no sensor
- `src/components/SkeletonVisualization3D.js` → 3D skeleton visualization
- `src/services/api.js` → API helpers for backend calls
- `src/hooks/usePressureGrid.js` → normalizes different pressure data formats into a grid
- `src/utils/skeleton.js` → skeleton edges mapping
- `src/config.js` → backend base URL and endpoints

## Development

Run the frontend:

```bash
npm install
npm start
```

If the backend is running elsewhere, set `REACT_APP_BACKEND_URL` in `.env`.

## Notes

- The heatmap uses a simple grid: cells with `-1` are transparent to reveal the foot shape.
- The system is designed for plug-and-play data: provide either `frames` (preferred) or `nodes` and the frontend adapts.