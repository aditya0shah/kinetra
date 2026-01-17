// Centralized configuration for backend connections
// Update BASE_URL to point to your Flask server
const CONFIG = {
  BASE_URL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000',
  ENDPOINTS: {
    PRESSURE_FRAME: '/api/pressure/latest',
    PRESSURE_STREAM: '/api/pressure/stream', // SSE or WebSocket (server-dependent)
    INFERENCE_LATEST: '/api/inference/latest',
    SKELETON_LATEST: '/api/skeleton/latest',
  },
};

export default CONFIG;
