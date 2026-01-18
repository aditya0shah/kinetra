import { RealtimeVision } from '@overshoot/sdk';

const DEFAULT_CONFIG = {
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'ovs_05cc66b47852ff919396f9507ba190b0',
  prompt: 'describe the scene in detail',
};

let visionInstance = null;

export const startOvershootVision = async ({ prompt, onResult, onError } = {}) => {
  if (visionInstance) {
    await stopOvershootVision();
  }

  visionInstance = new RealtimeVision({
    apiUrl: DEFAULT_CONFIG.apiUrl,
    apiKey: DEFAULT_CONFIG.apiKey,
    prompt: prompt || DEFAULT_CONFIG.prompt,
    backend: 'overshoot',
    debug: true,
    onResult,
    onError,
    processing: {
    clip_length_seconds: 0.7,
    delay_seconds: 0.2,
    fps: 30,
    sampling_ratio: 0.85
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
