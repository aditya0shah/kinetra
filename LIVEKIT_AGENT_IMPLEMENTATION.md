# LiveKit Agent – Correct Implementation Guide

This document explains how the frontend, backend agent, and LiveKit Cloud fit together, and the recommended patterns.

---

## 1. Architecture Overview

```
┌─────────────────────┐     connection-details      ┌──────────────────────┐
│  Frontend (React)   │ ──── POST (room, agent     →│  LiveKit Cloud       │
│  FloatingAIButton   │      dispatch)              │  Sandbox API         │
│  LiveKitRoom        │                             │  (api/v2/sandbox/    │
│  useVoiceAssistant  │←──── { serverUrl,           │   connection-details)│
└─────────┬───────────┘      participantToken }     └──────────┬───────────┘
          │ connect(serverUrl, token)                          │
          │                                                    │ dispatch
          ▼                                                    ▼
┌─────────────────────┐                             ┌──────────────────────┐
│  LiveKit Room       │◀──── agent joins as         │  Your Agent          │
│  (LiveKit Cloud     │      AGENT participant      │  (agent.py or        │
│   or self‑hosted)   │                             │   Cloud‑hosted)      │
└─────────────────────┘                             └──────────────────────┘
```

- **Frontend**: Gets `serverUrl` + `participantToken` from a token/connection-details source, connects with `LiveKitRoom`, and uses `useVoiceAssistant` to read agent state.
- **Sandbox (or your token endpoint)**: Returns `serverUrl` and `participantToken`, and can encode **agent dispatch** (agent name + metadata) so the room dispatches your agent when the user joins.
- **Agent**: Registers with `agent_name="voice-assistant"`, connects to the same LiveKit project, and is dispatched into the room when the frontend’s token asks for it.

---

## 2. Frontend – Correct Pattern

### 2.1 Token / connection-details

Use the **LiveKit `TokenSource`** so the request/response and URL stay in sync with the Cloud API.

**Recommended: `TokenSource.sandboxTokenServer`**

- **URL**: `https://cloud-api.livekit.io/api/v2/sandbox/connection-details` (the SDK uses **v2**; the older `/api/sandbox/connection-details` is deprecated or different).
- **Request**: `TokenSourceRequest`-shaped JSON, e.g.:
  - `roomName`, `participantName`, `participantIdentity`, `participantMetadata`, `participantAttributes`
  - `agentName`, `agentMetadata` → mapped to `room_config.agents[]` for agent dispatch.

**`TokenSourceFetchOptions` (what you pass to `tokenSource.fetch`):**

```ts
{
  roomName: string;
  participantName?: string;
  participantIdentity?: string;
  participantMetadata?: string;
  participantAttributes?: Record<string, string>;
  agentName?: string;      // e.g. "voice-assistant"
  agentMetadata?: string;  // JSON string, e.g. '{"workout_id":"..."}'
}
```

**Example:**

```js
import { TokenSource } from 'livekit-client';

const tokenSource = TokenSource.sandboxTokenServer(CONFIG.LIVEKIT_SANDBOX_ID);
const { serverUrl, participantToken } = await tokenSource.fetch({
  roomName: `kinetra-session-${workoutId ? 'workout-' + workoutId + '-' : ''}${Date.now()}`,
  participantName: `user-${Math.random().toString(36).substring(7)}`,
  agentName: 'voice-assistant',
  ...(workoutId && { agentMetadata: JSON.stringify({ workout_id: workoutId }) }),
});
// → pass serverUrl and participantToken to LiveKitRoom
```

### 2.2 LiveKitRoom

- `serverUrl`, `token` (= `participantToken` from the response)
- `connect={true}`, `audio={true}`, `video={false}` for voice-only
- `onDisconnected` to clear state and reset UI

### 2.3 useVoiceAssistant

- Must run **inside** `LiveKitRoom` (or `RoomContext`).
- Finds the first `ParticipantKind.AGENT` and `lk.agent.state` (e.g. `listening` | `thinking` | `speaking`).
- Your `AgentSession` in Python sets that attribute; no extra frontend config.

### 2.4 Pitfalls in the previous custom fetch

1. **URL**: Used `/api/sandbox/connection-details` instead of `/api/v2/sandbox/connection-details`.
2. **Body**: Custom `room_config.agent_dispatch`; the v2 API expects `TokenSourceRequest` with `room_config.agents[]` (and `agentName`/`agentMetadata` in `TokenSourceFetchOptions`).
3. **Request shape**: Manual JSON may not match `TokenSourceRequest` proto/JSON, so agent dispatch could be ignored.

Using `TokenSource.sandboxTokenServer` removes these mismatches.

---

## 3. Backend Agent – Correct Pattern

### 3.1 Entrypoint and agent name

- Use **one** `@server.rtc_session(agent_name="voice-assistant")` (or the same name you pass as `agentName` in the frontend).
- In the session:
  1. Read `workout_id` from, in order: `ctx.job.metadata` (from `agentMetadata`), room name, participant metadata.
  2. `await ctx.connect()`.
  3. Build `AgentSession` with STT, LLM, TTS, VAD, `turn_detection`, and `tools`.
  4. `await session.start(room=ctx.room, agent=Assistant())`.
  5. `await session.generate_reply(instructions="...")` for the first greeting.

### 3.2 Tools

- Use `@function_tool` and pass the same list into `AgentSession(..., tools=workout_tools)`.
- Tools run in the same process as the agent; they can use `current_workout_context`, `get_workout_by_id`, etc., as long as `MONGODB_URI` and env are set.

### 3.3 Job metadata and `workout_id`

- `agentMetadata` in the frontend becomes `ctx.job.metadata` in the agent.
- Parse JSON and read `workout_id`; fallback to room name or participant metadata if needed.

### 3.4 Running the agent

**Option A – LiveKit Cloud (recommended for production)**

- Deploy with `lk app create` / `lk agent deploy` (or your LiveKit Cloud workflow).
- LiveKit injects `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- You configure **secrets** for `OPENAI_API_KEY` and `MONGODB_URI`.
- The sandbox’s connection-details will dispatch to this Cloud-hosted agent when `agentName` matches.

**Option B – Local worker**

- Run `python agent.py start` (or `dev`) with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `backend/.env` for the **same** LiveKit project.
- The Cloud project must be set up to dispatch to this worker (e.g. via agent definitions that point at your agent name). The sandbox may still prefer Cloud-deployed agents; for a fully local agent you may need a different token/agent-dispatch path.

**401 on connect**

- 401 means the worker’s API key/secret are not valid for the `LIVEKIT_URL` project.
- Fix: [Cloud Console](https://cloud.livekit.io) → project matching `LIVEKIT_URL` → Project settings → API Keys → create/copy key+secret → set in `backend/.env`.
- Use `python check_livekit.py` to verify.

---

## 4. Production: Move Off Sandbox

The sandbox token/connection-details API is for prototyping. For production:

1. **Backend token endpoint**  
   Implement a route (e.g. `/livekit-token` or `/api/livekit/connection-details`) that:
   - Takes `roomName`, `participantName`, `agentName`, `agentMetadata` (or equivalent).
   - Uses your `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to create a token that includes `RoomConfiguration.agents` (agent dispatch) and returns `{ serverUrl, participantToken }` in the same shape as the sandbox.

2. **Frontend**  
   - Replace `TokenSource.sandboxTokenServer(...)` with `TokenSource.endpoint('https://your-api/api/livekit/connection-details', { ... })`,  
   - or a `TokenSource.custom` that calls your backend and returns `{ serverUrl, participantToken }` in the same format.

3. **Agent**  
   - Unchanged: still `agent_name="voice-assistant"`, same `AgentSession` and tools; only the way the room and dispatch are created (via your token) changes.

---

## 5. Checklist

| Layer        | Item                                            | Status / Action                                |
|-------------|--------------------------------------------------|------------------------------------------------|
| Frontend    | Use `TokenSource.sandboxTokenServer` (or endpoint) | Use `TokenSource.sandboxTokenServer` + `fetch` |
| Frontend    | Pass `agentName` and `agentMetadata`             | In `fetch({ agentName, agentMetadata })`       |
| Frontend    | `LiveKitRoom`: `serverUrl`, `token`, `audio`     | Already correct                                |
| Frontend    | `useVoiceAssistant` inside `LiveKitRoom`         | Already correct                                |
| Agent       | `@server.rtc_session(agent_name="voice-assistant")` | Already correct                                |
| Agent       | `workout_id` from job metadata, room, participant | Already correct                                |
| Agent       | `AgentSession` with tools                        | Already correct                                |
| Credentials | `backend/.env` or Cloud secrets                  | Run `python check_livekit.py`; fix 401         |
| Deployment  | Cloud vs local worker                            | Prefer Cloud for production                    |

---

## 6. References

- [LiveKit – Sandbox token](https://docs.livekit.io/frontends/authentication/tokens/sandbox-token-server)  
- [LiveKit – Web & mobile frontends](https://docs.livekit.io/frontends/start/frontends) (useVoiceAssistant, BarVisualizer)  
- [LiveKit – Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch) (metadata, agent name)  
- [LiveKit – Job / metadata](https://docs.livekit.io/agents/server/job)  
- `livekit-client`: `TokenSource`, `TokenSourceFetchOptions`, `TokenSourceRequest` / `TokenSourceResponse`
