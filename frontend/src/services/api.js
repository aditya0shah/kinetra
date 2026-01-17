import CONFIG from '../config';

const handleResponse = async (res) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
};

// Workouts API
export const getWorkouts = async () => {
  const url = `${CONFIG.BASE_URL}/workouts`;
  const response = await handleResponse(await fetch(url));
  return response.data || [];
};

export const getWorkout = async (workoutId) => {
  const url = `${CONFIG.BASE_URL}/workouts/${workoutId}`;
  const response = await handleResponse(await fetch(url));
  return response.data;
};

export const createWorkout = async (workoutData) => {
  const url = `${CONFIG.BASE_URL}/workouts`;
  const response = await handleResponse(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workoutData)
    })
  );
  return response.data;
};

export const updateWorkout = async (workoutId, updates) => {
  const url = `${CONFIG.BASE_URL}/workouts/${workoutId}`;
  const response = await handleResponse(
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
  );
  return response.data;
};

export const deleteWorkout = async (workoutId) => {
  const url = `${CONFIG.BASE_URL}/workouts/${workoutId}`;
  return handleResponse(
    await fetch(url, { method: 'DELETE' })
  );
};

// Stats API
export const sendstat = async (framePayload, sessionId = 'default') => {
  // Ensure this URL matches the @app.post("/stats") route
  const url = `${CONFIG.BASE_URL}/stats`;

  // Support both legacy matrix-only calls and full frame payloads
  const payload = (() => {
    if (Array.isArray(framePayload)) {
      // Legacy usage: sendstat(matrix, sessionId)
      return { matrix: framePayload, session_id: sessionId };
    }
    // New usage: sendstat({ matrix, nodes, timestamp }, sessionId)
    const { matrix, nodes, timestamp } = framePayload || {};
    return {
      matrix: matrix || [[]],
      nodes: nodes,
      timestamp: timestamp,
      session_id: sessionId,
    };
  })();

  return handleResponse(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
};

