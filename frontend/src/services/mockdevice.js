/**
 * Mock Bluetooth Device Service
 * Simulates streaming foot pressure data from a Bluetooth device
 */

// Initialize a foot insole pressure grid
const initializePressureGrid = (rows = 4, cols = 4) => {
  const nodes = [];
  const count = rows * cols;
  const xStep = cols > 1 ? 100 / (cols - 1) : 0;
  const yStep = rows > 1 ? 100 / (rows - 1) : 0;
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: i,
      position: {
        x: (i % cols) * xStep,
        y: Math.floor(i / cols) * yStep
      },
      pressure: 0,
    });
  }
  return nodes;
};

/**
 * Stream mock pressure data from fake Bluetooth device
 * Sends data every 250ms (1/4 second)
 * @param {Function} onDataReceived - Callback when data is received
 * @param {number} interval - Interval in ms between data points (default: 250ms = 1/4 second)
 * @returns {Function} Stop function to halt the stream
 */
export const startMockDeviceStream = (onDataReceived, interval = 250, options = {}) => {
  const {
    rows = 4,
    cols = 4,
    includeNodes = true,
  } = options;
  let streamActive = true;
  let frameCount = 0;

  const streamData = () => {
    if (!streamActive) return;

    // Generate random pressure data from 1 to 10
    const pressureData = includeNodes
      ? initializePressureGrid(rows, cols).map((node) => ({
      ...node,
      pressure: Math.random() * 9 + 1  // Random value between 1 and 10
    }))
      : [];

    // Create rows x cols matrix of random values (1-10)
    const matrix = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push(Math.random() * 9 + 1);  // Random value between 1 and 10
      }
      matrix.push(row);
    }

    // Add metadata
    const frameData = {
      timestamp: Date.now(),
      frameNumber: frameCount++,
      sensorType: 'insole_pressure',
      ...(includeNodes ? { nodes: pressureData } : {}),
      matrix: matrix
    };

    // Call the callback with the frame data
    onDataReceived(frameData);

    // Schedule next frame - every 250ms (1/4 second)
    setTimeout(streamData, interval);
  };

  // Start the stream
  streamData();

  // Return stop function
  return () => {
    streamActive = false;
  };
};

/**
 * Convert pressure data to matrix format for backend API
 * @param {Object} frameData - Frame data from mock device
 * @returns {Array} 2D matrix of pressure values
 */
export const convertToMatrix = (frameData) => {
  if (!frameData || !frameData.matrix) {
    return [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
  }
  
  return frameData.matrix;
};
