import { RealtimeVision } from '@overshoot/sdk';

const DEFAULT_CONFIG = {
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: "ovs_a783f2aaba2a4906cebbf0e6be249b22",
  prompt: 'Read any visible text',
};

let visionInstance = null;
let skeletonFrameCallback = null;

/**
 * Start Overshoot Vision with skeleton frame integration
 * @param {Object} options Configuration options
 * @param {string} options.prompt The prompt for the VLM
 * @param {function} options.onResult Callback when VLM produces a result
 * @param {function} options.onError Callback for errors
 * @param {function} options.onSkeletonFrame Callback to receive skeleton frames for VLM
 * @returns {Promise<Object>} Object containing vision instance and stream
 */
export const startOvershootVision = async ({ prompt, onResult, onError, onSkeletonFrame } = {}) => {
  if (visionInstance) {
    await stopOvershootVision();
  }

  // Store skeleton frame callback for passing frames to VLM
  skeletonFrameCallback = onSkeletonFrame;

  visionInstance = new RealtimeVision({
    apiUrl: DEFAULT_CONFIG.apiUrl,
    apiKey: DEFAULT_CONFIG.apiKey,
    prompt: prompt || 'The user is doing a workout. Describe the workout in detail, focusing on form and technique.',
    source: { type: 'camera', cameraFacing: 'environment' },
    onResult: (result) => {
      if (onResult) onResult(result);
    }
  });

  await visionInstance.start();
  return { vision: visionInstance, stream: visionInstance.getMediaStream() };
};

/**
 * Send a skeleton frame to the VLM for analysis
 * @param {string} base64Frame Base64 encoded PNG image from skeleton generator
 */
export const sendSkeletonFrameToVLM = async (base64Frame) => {
  if (!visionInstance) {
    console.warn('VLM not started. Call startOvershootVision first.');
    return;
  }

  if (!base64Frame) {
    console.warn('No skeleton frame provided');
    return;
  }

  try {
    // Convert base64 to blob for the VLM
    const byteCharacters = atob(base64Frame);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    // Create an image element to pass to VLM
    const imageUrl = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
      // VLM can process this image
      if (skeletonFrameCallback) {
        skeletonFrameCallback(img);
      }
      URL.revokeObjectURL(imageUrl);
    };
    
    img.src = imageUrl;
  } catch (error) {
    console.error('Error sending skeleton frame to VLM:', error);
  }
};

export const stopOvershootVision = async () => {
  if (!visionInstance) return;
  try {
    await visionInstance.stop();
  } finally {
    visionInstance = null;
    skeletonFrameCallback = null;
  }
};

