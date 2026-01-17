/**
 * Mock Bluetooth Device Service
 * Simulates streaming foot pressure data from a Bluetooth device
 */

// Initialize a 16-node foot insole pressure grid (4x4)
const initializePressureGrid = () => {
  const nodes = [];
  for (let i = 0; i < 16; i++) {
    nodes.push({
      id: i,
      position: {
        x: (i % 4) * 25,
        y: Math.floor(i / 4) * 33.33
      },
      pressure: 0
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
export const startMockDeviceStream = (onDataReceived, interval = 250) => {
  let streamActive = true;
  let frameCount = 0;

  const streamData = () => {
    if (!streamActive) return;

    // Generate random pressure data from 1 to 10
    const pressureData = initializePressureGrid().map((node) => ({
      ...node,
      pressure: Math.random() * 9 + 1  // Random value between 1 and 10
    }));

    // Create 4x4 matrix of random values (1-10)
    const matrix = [];
    for (let i = 0; i < 4; i++) {
      const row = [];
      for (let j = 0; j < 4; j++) {
        row.push(Math.random() * 9 + 1);  // Random value between 1 and 10
      }
      matrix.push(row);
    }

    // Add metadata
    const frameData = {
      timestamp: Date.now(),
      frameNumber: frameCount++,
      sensorType: 'insole_pressure',
      nodes: pressureData,
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
