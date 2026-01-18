# WebSocket Setup for Pressure Data Streaming

## Overview
WebSocket has been implemented to stream pressure data in real-time from the frontend device to the backend MongoDB, replacing the previous HTTP POST-based approach. This provides better performance and lower latency for continuous data streaming.

## What Changed

### Backend Changes

#### 1. **Updated `backend/requirements.txt`**
Added WebSocket dependencies:
- `Flask-SocketIO` - Flask integration for WebSocket
- `python-socketio` - WebSocket server implementation
- `python-engineio` - Transport layer for WebSocket

#### 2. **Updated `backend/app.py`**
- Integrated Flask-SocketIO with CORS support
- Added WebSocket event handlers:
  - `connect` - Client connection
  - `join_session` - Client joins a workout session
  - `pressure_frame` - Receives pressure matrix data
  - `leave_session` - Client leaves session
- Tracks active sessions with frame counts
- Broadcasts calculated stats back to connected clients
- Maintains HTTP endpoints for backward compatibility

#### 3. **New WebSocket Events**
```python
@socketio.on('join_session')     # Join workout session
@socketio.on('pressure_frame')   # Send pressure data
@socketio.on('leave_session')    # Leave session
```

### Frontend Changes

#### 1. **Updated `frontend/package.json`**
Added dependency:
- `socket.io-client` - WebSocket client for React

#### 2. **Created `frontend/src/services/websocket.js`**
New WebSocket service module with functions:
- `connectWebSocket()` - Connect to server
- `joinSession(workoutId)` - Join a workout session
- `sendPressureFrame(workoutId, matrix, nodes, timestamp)` - Send pressure data
- `onFrameProcessed(callback)` - Listen for processed frames
- `leaveSession(workoutId)` - Leave session
- `disconnectWebSocket()` - Close connection

#### 3. **Updated `frontend/src/pages/EpisodeDetail.js`**
- Imports WebSocket functions
- Establishes WebSocket connection when workout starts
- Sends pressure frames via WebSocket instead of HTTP
- Listens for real-time stats responses
- Properly disconnects on workout completion
- Maintains local accumulation of pressure matrix data

## How It Works

### Data Flow During Workout
1. **Device Stream**: Mock device generates pressure frame data every 250ms
2. **WebSocket Send**: Frame sent to backend via `sendPressureFrame()`
3. **Backend Processing**: 
   - Stats calculated from pressure matrix
   - Data saved to MongoDB
   - Stats broadcasted back to client
4. **Frontend Receive**: Stats received and displayed in real-time
5. **Local Accumulation**: All frames accumulated for final DB save

### Workflow
```
Frontend                          Backend                         MongoDB
   |                               |                               |
   +------- Connect WS ------------>|                               |
   |                               |                               |
   +------- Join Session ---------->|                               |
   |                               |                               |
   | [Device generates frame]      |                               |
   +------- Pressure Frame -------->|                               |
   |                          [Calculate stats]                     |
   |                               +------------ Save Data -------->|
   |<----- Frame Processed --------|                               |
   |    (with stats)               |                               |
   |                               |                               |
   | [Stream continues every 250ms]|                               |
   |                               |                               |
   +------- Leave Session -------->|                               |
   |                          [Mark session end]                    |
   |<----- Session Ended ---------|                               |
   |                               |                               |
   [Send final timeSeriesData]    |                               |
   +------------ Update Workout -->[------------ Update DB -------->|
```

## Installation & Setup

### Backend
1. Dependencies already installed via `pip install -r backend/requirements.txt`
2. Flask-SocketIO is now running in app.py on port 5001

### Frontend
1. Install new dependencies:
```bash
cd frontend
npm install
```

2. Start development server:
```bash
npm start
```

## Configuration

### Backend (app.py)
- **Port**: 5001 (same as before)
- **CORS**: Enabled for all origins (`*`)
- **Transports**: WebSocket + polling fallback
- **Secret Key**: Set via `SECRET_KEY` environment variable (defaults to placeholder)

### Frontend (websocket.js)
- **Server URL**: Uses `CONFIG.BASE_URL` from config.js
- **Reconnection**: Automatic with exponential backoff
- **Fallback**: Uses polling if WebSocket unavailable
- **Room-based**: Each workout is a separate room

## Key Features

✅ **Real-time Streaming**: Low-latency pressure data
✅ **Automatic Reconnection**: Handles network interruptions
✅ **Session Management**: Tracks active workouts
✅ **Frame Counting**: Monitors data flow per session
✅ **Backward Compatible**: HTTP endpoints still available
✅ **MongoDB Integration**: Direct data saving
✅ **Error Handling**: Comprehensive error logging

## WebSocket Events Reference

### Client → Server
| Event | Payload | Purpose |
|-------|---------|---------|
| `join_session` | `{workout_id}` | Start streaming for a workout |
| `pressure_frame` | `{workout_id, matrix, nodes, timestamp}` | Send pressure data |
| `leave_session` | `{workout_id}` | Stop streaming |

### Server → Client
| Event | Payload | Purpose |
|-------|---------|---------|
| `session_joined` | `{workout_id, status}` | Confirmed session join |
| `frame_processed` | `{stats, frame_count, timestamp}` | Calculated stats |
| `session_ended` | `{workout_id}` | Session terminated |
| `error` | `{message}` | Error notification |

## Monitoring

Monitor WebSocket activity in browser console:
- Connection: `"WebSocket connected: [socket-id]"`
- Session Join: `"Joined WebSocket session for workout: [id]"`
- Stats Received: `"Received stats from WebSocket: [stats]"`
- Disconnect: `"WebSocket disconnected"`

Backend logs show:
- Client connections and disconnections
- Session joins/leaves
- Frame counts per session
- Processing status

## Troubleshooting

### WebSocket Connection Failed
- Check backend is running on port 5001
- Verify CORS settings in browser console
- Check network tab for WebSocket handshake

### Stats Not Updating
- Verify session was successfully joined
- Check backend logs for processing errors
- Confirm MongoDB connection is active

### High Memory Usage
- Frame data is accumulated locally until workout completes
- Check `pressureMatrixData` array size in React DevTools
- Consider adding pagination if sessions are very long

## Future Enhancements

- Add data batching for better throughput
- Implement compression for large matrices
- Add authentication/authorization
- Implement rate limiting
- Add metrics/analytics dashboard
- Support multiple simultaneous connections
