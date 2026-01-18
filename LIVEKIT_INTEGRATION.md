# Kinetra AI Coach - LiveKit Integration

## What's Included

A **floating AI fitness coach** in the frontend that talks to **one agent** (`backend/agent.py`). The agent has access to workout data via tools and receives `workout_id` when the user is on an episode page.

### One agent, no Cloud deploy

- **Frontend**: `FloatingAIButton` gets `{ serverUrl, participantToken }` from your **backend** `POST /api/livekit/connection` (default). No sandbox, no `lk agent deploy`, no Builder.
- **Backend**: Flask exposes `/api/livekit/connection` and issues tokens with `agent_name` (from `LIVEKIT_AGENT_NAME` or frontend `agentName`) so LiveKit dispatches your local agent.
- **Agent**: Run `python agent.py start` in `backend/`. It registers with the same `agent_name`; when a user joins, it gets dispatched to that room.

### How It Works

1. **Click floating button** → Opens AI Coach modal  
2. **Click "Start Session"** → Frontend calls `POST /api/livekit/connection` with `{ roomName, participantName, workoutId?, agentName? }`; backend returns `{ serverUrl, participantToken }` with agent dispatch for that `agent_name`.  
3. **User joins room** → LiveKit dispatches your local `agent.py` worker into the room.  
4. **Start talking** → Agent uses tools (`get_workout_id_from_session`, `get_current_workout`, etc.) and speaks back.

### Configuration

#### Backend `backend/.env`

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` – from your [LiveKit Cloud](https://cloud.livekit.io) project (Project settings → API Keys). **Must match the project your agent connects to.**
- `LIVEKIT_AGENT_NAME` – (optional) agent name used in token dispatch and by `agent.py`; default `Jordan-d13`. Must match `@server.rtc_session(agent_name=...)` in `agent.py`.
- `OPENAI_API_KEY` – for STT/LLM/TTS.  
- `MONGODB_URI` – for `get_workout_by_id` and other tools.

Run `python check_livekit.py` in `backend/` to verify credentials.

#### Frontend

- **`LIVEKIT_USE_BACKEND`** (default: true) – use `POST /api/livekit/connection` from `CONFIG.BASE_URL`. Set `REACT_APP_LIVEKIT_USE_BACKEND=false` to use the Sandbox instead.  
- **`BASE_URL`** – backend URL (e.g. `http://127.0.0.1:5001`). Must match where Flask runs.  
- **`AGENT_NAME`** – (in `config.js`) must match `LIVEKIT_AGENT_NAME` / `agent_name` in `agent.py`; default `Jordan-d13`. The frontend sends this as `agentName` to `/api/livekit/connection`.
- **Sandbox** (only when `LIVEKIT_USE_BACKEND=false`): `REACT_APP_LIVEKIT_SANDBOX_ID`, `REACT_APP_LIVEKIT_SANDBOX_BASE_URL`.

The component:
- Requests microphone permission, handles audio, shows agent state (listening/thinking/speaking)
- Sends `workout_id` to the agent when on `/episode/:id`

### Dependencies

Required npm packages:
```bash
npm install @livekit/components-react livekit-client @livekit/components-styles
```

Already installed in this project.

### Usage

Include the `<FloatingAIButton />` component in your app (already in `App.js`). The floating button appears on all pages. On `/episode/:id`, the `workout_id` is passed to the agent so the coach can use workout-specific tools.

### Running the agent

1. In `backend/`: copy `.env.example` to `.env` and set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `OPENAI_API_KEY`, `MONGODB_URI`. Optionally `LIVEKIT_AGENT_NAME` (default `Jordan-d13`); it must match `config.AGENT_NAME` in the frontend and `agent_name` in `agent.py`.
2. Run `python check_livekit.py` in `backend/`; fix any 401.
3. Start the agent: `python agent.py start` (or `dev`).
4. Start Flask: e.g. `flask run` or `python app.py`.
5. Start the frontend; open the app and use the AI Coach. It will call `/api/livekit/connection` and connect to the room; your local agent will be dispatched.

### Optional: Sandbox / Cloud agent

Set `REACT_APP_LIVEKIT_USE_BACKEND=false` to use `TokenSource.sandboxTokenServer` and a LiveKit Sandbox instead of your backend. You’ll need a sandbox and, for a cloud-hosted agent, `lk agent deploy` or the Cloud dashboard. The default is backend + local agent.

### Troubleshooting

**401 when connecting to LiveKit** (`WSServerHandshakeError: 401` at `wss://….livekit.cloud/agent`): Your API key/secret are not valid for this project. Run from `backend/`:

  python check_livekit.py

It will confirm or reject your `backend/.env` credentials. To fix: [LiveKit Cloud](https://cloud.livekit.io) → your project (matching `LIVEKIT_URL`) → **Project settings** → **API Keys** → create or copy a key+secret → set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `backend/.env`. Use keys from this project only.

**Logging:** The agent sets `livekit.agents` and `aiohttp` to `WARNING` to reduce "process initialized" and retry noise. Fix 401 with the correct API key/secret so the worker connects without repeated retries.

---

**That's it!** The AI Coach is fully integrated and can use website/workout data through the tools in `agent.py`. 🎤
