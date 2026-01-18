import io from 'socket.io-client';
import CONFIG from '../config';

let socket = null;

/**
 * Connect to WebSocket server
 * @returns {SocketIOClient.Socket}
 */
export const connectWebSocket = () => {
  if (socket && socket.connected) {
    console.log('WebSocket already connected:', socket.id);
    return socket;
  }

  console.log('Creating new WebSocket connection to:', CONFIG.BASE_URL);
  socket = io(CONFIG.BASE_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    timeout: 20000,
    path: '/socket.io',
    // Prefer WebSocket with polling fallback
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('✅ WebSocket connected:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ WebSocket connection error:', error);
  });

  socket.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  socket.on('disconnect', () => {
    console.log('⚠️ WebSocket disconnected');
  });

  socket.on('connection_response', (data) => {
    console.log('📡 Connection response:', data);
  });

  return socket;
};

/**
 * Disconnect WebSocket
 */
export const disconnectWebSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Join a workout session
 * @param {string} workoutId
 * @returns {Promise}
 */
export const joinSession = (workoutId) => {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    socket.emit('join_session', { workout_id: workoutId }, (response) => {
      if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });

    // Listen for session_joined event
    socket.once('session_joined', (data) => {
      resolve(data);
    });

    socket.once('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Send pressure frame data to server
 * @param {string} workoutId
 * @param {Array} matrix - Pressure matrix data
 * @param {Array} nodes - Pressure nodes
 * @param {number} timestamp - Frame timestamp
 */
export const sendPressureFrame = (workoutId, matrix, nodes, timestamp) => {
  if (!socket || !socket.connected) {
    console.warn('⚠️ WebSocket not connected, unable to send pressure frame');
    return;
  }

  console.log('📤 Sending pressure_frame:', { workoutId, matrixSize: matrix.length, nodesCount: nodes?.length });
  socket.emit('pressure_frame', {
    workout_id: workoutId,
    matrix: matrix,
    nodes: nodes,
    timestamp: timestamp
  });
};

/**
 * Listen for frame processing responses
 * @param {Function} callback
 */
export const onFrameProcessed = (callback) => {
  if (socket) {
    socket.on('frame_processed', callback);
  }
};

export const onStatsUpdate = (callback) => {
  if (socket) {
    socket.on('stats_update', callback);
  }
};

/**
 * Remove frame/stats listeners
 * @param {Function} frameCb
 * @param {Function} statsCb
 */
export const offFrameProcessed = (frameCb) => {
  if (socket && frameCb) {
    socket.off('frame_processed', frameCb);
  }
};

export const offStatsUpdate = (statsCb) => {
  if (socket && statsCb) {
    socket.off('stats_update', statsCb);
  }
};

/**
 * Leave workout session
 * @param {string} workoutId
 */
export const leaveSession = (workoutId) => {
  if (socket && socket.connected) {
    socket.emit('leave_session', { workout_id: workoutId });
    socket.off('frame_processed');
  }
};

/**
 * Get socket instance
 * @returns {SocketIOClient.Socket|null}
 */
export const getSocket = () => socket;
