/**
 * Centralized app configuration.
 * Prefer REACT_APP_* in .env for overrides. Never put API secrets here.
 */

const CONFIG = {
  // ---------------------------------------------------------------------------
  // Backend
  // ---------------------------------------------------------------------------
  BASE_URL: process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5001',

  // ---------------------------------------------------------------------------
  // LiveKit (AI Coach)
  // serverUrl and token come from backend /api/livekit/connection or Sandbox.
  // ---------------------------------------------------------------------------
  /** Use backend for tokens (true) or Sandbox (false). Default: true. */
  LIVEKIT_USE_BACKEND: process.env.REACT_APP_LIVEKIT_USE_BACKEND !== 'false',

  /** LiveKit server URL. Only needed if you bypass the connection endpoint. */
  LIVEKIT_URL: process.env.REACT_APP_LIVEKIT_URL || 'wss://kinetra-p25w3j1b.livekit.cloud',

  /** Agent name to request in token (must match agent_name in backend/agent.py). */
  AGENT_NAME: process.env.REACT_APP_AGENT_NAME || 'Jordan-d13',

  // Sandbox (only when LIVEKIT_USE_BACKEND is false)
  LIVEKIT_SANDBOX_ID: process.env.REACT_APP_LIVEKIT_SANDBOX_ID || 'kinetra-awfxyh',
  LIVEKIT_SANDBOX_BASE_URL: process.env.REACT_APP_LIVEKIT_SANDBOX_BASE_URL || '',

  // ---------------------------------------------------------------------------
  // API endpoints (relative to BASE_URL unless absolute)
  // ---------------------------------------------------------------------------
  ENDPOINTS: {
    PRESSURE_FRAME: '/api/pressure/latest',
    PRESSURE_STREAM: '/api/pressure/stream',
    INFERENCE_LATEST: '/api/inference/latest',
    SKELETON_LATEST: '/api/skeleton/latest',
    SESSION_START: '/session/start',
    LIVEKIT_TOKEN: '/livekit-token',
    LIVEKIT_CONNECTION: '/api/livekit/connection',
  },

  // ---------------------------------------------------------------------------
  // BLE / hardware
  // ---------------------------------------------------------------------------
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
