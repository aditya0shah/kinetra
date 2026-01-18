// Centralized configuration for backend connections
// Update BASE_URL to point to your Flask server
const CONFIG = {
  BASE_URL: process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5001',
  LIVEKIT_URL: process.env.REACT_APP_LIVEKIT_URL || 'wss://livekit-server',
  AGENT_NAME: process.env.REACT_APP_AGENT_NAME || 'Casey-1337',
  ENDPOINTS: {
    PRESSURE_FRAME: '/api/pressure/latest',
    PRESSURE_STREAM: '/api/pressure/stream', // SSE or WebSocket (server-dependent)
    INFERENCE_LATEST: '/api/inference/latest',
    SKELETON_LATEST: '/api/skeleton/latest',
    SESSION_START: '/session/start',
    LIVEKIT_TOKEN: '/livekit-token',
  },
  BLE: {
    DEVICE_NAME: process.env.REACT_APP_BLE_DEVICE_NAME || 'BLE_Test',
    ROWS: Number(process.env.REACT_APP_BLE_ROWS || 13),
    COLS: Number(process.env.REACT_APP_BLE_COLS || 9),
    MIN_V: Number(process.env.REACT_APP_BLE_MIN || -1),
    MAX_V: Number(process.env.REACT_APP_BLE_MAX || 3700),
    USE_SEQUENCE: process.env.REACT_APP_BLE_USE_SEQUENCE === 'true',
  },
};

export default CONFIG;
