// Centralized configuration for backend connections
// Update BASE_URL to point to your Flask server
const CONFIG = {
  BASE_URL: process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5001',
  ENDPOINTS: {
    PRESSURE_FRAME: '/api/pressure/latest',
    PRESSURE_STREAM: '/api/pressure/stream', // SSE or WebSocket (server-dependent)
    INFERENCE_LATEST: '/api/inference/latest',
    SKELETON_LATEST: '/api/skeleton/latest',
    SESSION_START: '/session/start',
  },
};

export default CONFIG;
