import CONFIG from '../config';

const handleResponse = async (res) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
};

export const fetchPressureFrame = async () => {
  const url = `${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.PRESSURE_FRAME}`;
  return handleResponse(await fetch(url));
};

export const fetchInferenceLatest = async () => {
  const url = `${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.INFERENCE_LATEST}`;
  return handleResponse(await fetch(url));
};

export const fetchSkeletonLatest = async () => {
  const url = `${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SKELETON_LATEST}`;
  return handleResponse(await fetch(url));
};

// Optional: simple polling utility for pressure frames
export const pressurePoller = (onFrame, intervalMs = 200) => {
  let timer = null;
  const start = () => {
    if (timer) return;
    timer = setInterval(async () => {
      try {
        const frame = await fetchPressureFrame();
        onFrame(frame);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Pressure poll error:', e.message);
      }
    }, intervalMs);
  };
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  return { start, stop };
};
