import { RealtimeVision } from '@overshoot/sdk';

const DEFAULT_CONFIG = {
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: "ovs_a783f2aaba2a4906cebbf0e6be249b22",
  prompt: 'Read any visible text',
};

let visionInstance = null;

export const startOvershootVision = async ({ prompt, onResult, onError } = {}) => {
  if (visionInstance) {
    await stopOvershootVision();
  }

  visionInstance = new RealtimeVision({
    apiUrl: DEFAULT_CONFIG.apiUrl,
    apiKey: DEFAULT_CONFIG.apiKey,
    prompt: 'The user is doing a workout. Describe the workout in detail.',
    source: { type: 'camera', cameraFacing: 'environment' },
    onResult: (result) => {
      if (onResult) onResult(result);
    }
  });

  await visionInstance.start();
  return { vision: visionInstance, stream: visionInstance.getMediaStream() };
};

export const stopOvershootVision = async () => {
  if (!visionInstance) return;
  try {
    await visionInstance.stop();
  } finally {
    visionInstance = null;
  }
};
