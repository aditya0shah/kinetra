import json
import sys
import os
import time
from stats import calculate_region_stats, split_into_regions, apply_ema_stats
from db import (
        get_all_workouts,
        get_workout_by_id,
        create_workout,
        update_workout,
        delete_workout,
        save_pressure_data,
        workouts_collection,
    )

# Support running both as a package (python -m backend.app)
# and directly as a script (python backend/app.py)
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import numpy as np
from dotenv import load_dotenv

# Load .env from backend directory (same as agent.py)
_backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_backend_dir, ".env"))

# LiveKit imports for token generation
try:
    from livekit import api
except ImportError:
    api = None
    print("Warning: LiveKit not installed. Agent features will be disabled.")



def create_app() -> Flask:
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
    socketio = SocketIO(
        app, 
        cors_allowed_origins="*",
        ping_timeout=60,
        ping_interval=25,
        engineio_logger=False,
        socketio_logger=False,
        async_mode='threading'
    )
    
    # Track active sessions
    active_sessions = {}  # {workout_id: {'connected': bool, 'frame_count': int}}
    ema_state = {}  # {workout_id: smoothed_stats}
    EMA_ALPHA = 0.05
    EVENT_DEFINITIONS = {
        'region_force_high': {
            'mode': 'per_region_stat',
            'stat': 'mean_force',
            'threshold': 50,
            'comparison': 'gt',
            'min_interval_seconds': 5,
        },
        'region_force_low': {
            'mode': 'per_region_stat',
            'stat': 'mean_force',
            'threshold': 5,
            'comparison': 'lt',
            'min_interval_seconds': 5,
        },
    }

    def _to_epoch_seconds(timestamp):
        if isinstance(timestamp, (int, float)):
            return float(timestamp) / 1000.0 if timestamp > 1e12 else float(timestamp)
        return time.time()

    def _detect_events(stats, timestamp=None):
        if not isinstance(stats, dict):
            return []
        events = []
        for event_type, definition in EVENT_DEFINITIONS.items():
            mode = definition.get('mode')
            if mode == 'per_region_stat':
                stat_name = definition.get('stat')
                threshold = definition.get('threshold')
                comparison = definition.get('comparison', 'gt')
                for region_name, region_stats in stats.items():
                    if not isinstance(region_stats, dict):
                        continue
                    value = region_stats.get(stat_name)
                    if not isinstance(value, (int, float)) or not isinstance(threshold, (int, float)):
                        continue
                    if comparison == 'lt':
                        is_match = value <= threshold
                    else:
                        is_match = value >= threshold
                    if is_match:
                        events.append({
                            'type': event_type,
                            'region': region_name,
                            'stat': stat_name,
                            'value': float(value),
                            'threshold': float(threshold),
                            'comparison': comparison,
                            'timestamp': timestamp,
                        })
        return events

    def _get_events_for_save(workout_id, stats, timestamp=None, source='backend'):
        if not workout_id or not isinstance(stats, dict):
            return []
        events = _detect_events(stats, timestamp=timestamp)
        if not events:
            return []

        now_seconds = _to_epoch_seconds(timestamp)
        session_state = active_sessions.get(workout_id, {})
        last_event_times = session_state.setdefault('last_event_times', {})
        filtered_events = []
        for event in events:
            event_type = event.get('type')
            last_seen = last_event_times.get(event_type, 0)
            definition = EVENT_DEFINITIONS.get(event_type, {})
            min_interval = definition.get('min_interval_seconds', 0)
            if now_seconds - last_seen < min_interval:
                continue
            event['source'] = source
            last_event_times[event_type] = now_seconds
            filtered_events.append(event)

        if workout_id in active_sessions:
            active_sessions[workout_id]['last_event_times'] = last_event_times
        return filtered_events

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Max-Age"] = "86400"
        return response

    @app.get("/")
    def index():
        return jsonify({"status": "ok", "message": "Flask backend running"})

    @app.get("/health")
    def health():
        return jsonify({"status": "healthy"})

    @app.get("/livekit-token")
    def get_livekit_token():
        """Generate a LiveKit access token for connecting to the agent"""
        if not api:
            return jsonify({
                "error": "LiveKit SDK not installed",
                "hint": "Run: pip install livekit-api"
            }), 503
        
        try:
            # Get LiveKit credentials from environment
            livekit_url = os.getenv('LIVEKIT_URL')
            livekit_api_key = os.getenv('LIVEKIT_API_KEY')
            livekit_api_secret = os.getenv('LIVEKIT_API_SECRET')
            
            # Validate credentials are configured
            if not livekit_url:
                return jsonify({
                    "error": "LiveKit not configured",
                    "message": "LIVEKIT_URL is not set in .env",
                    "instructions": [
                        "1. Sign up at https://cloud.livekit.io",
                        "2. Create a project and get credentials",
                        "3. Add to backend/.env:",
                        "   LIVEKIT_URL=wss://your-project.livekit.cloud",
                        "   LIVEKIT_API_KEY=your-api-key",
                        "   LIVEKIT_API_SECRET=your-api-secret"
                    ]
                }), 503
            
            if not livekit_api_key or not livekit_api_secret:
                return jsonify({
                    "error": "LiveKit credentials incomplete",
                    "message": "LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set",
                    "hint": "Add both to backend/.env"
                }), 503
            
            # Generate a unique participant identity
            import time
            participant_identity = f"user_{int(time.time())}"
            
            # Create access token
            token = api.AccessToken(livekit_api_key, livekit_api_secret) \
                .with_identity(participant_identity) \
                .with_name("Kinetra User") \
                .with_grants(api.VideoGrants(
                    room_join=True,
                    room="kinetra-workout-session",
                    can_publish=True,
                    can_subscribe=True,
                ))
            
            jwt_token = token.to_jwt()
            
            return jsonify({
                "serverUrl": livekit_url,
                "token": jwt_token,
                "participantIdentity": participant_identity,
                "status": "success"
            }), 200
            
        except Exception as e:
            error_message = str(e)
            print(f"Error generating LiveKit token: {error_message}")
            import traceback
            traceback.print_exc()
            
            return jsonify({
                "error": "Token generation failed",
                "message": error_message,
                "hint": "Check that your LIVEKIT_API_KEY and LIVEKIT_API_SECRET are correct"
            }), 500

    @app.post("/api/livekit/connection")
    def livekit_connection():
        """Return { serverUrl, participantToken } for the frontend. Dispatches agent_name (local agent.py start)."""
        if not api:
            return jsonify({"error": "LiveKit SDK not installed", "hint": "Run: pip install livekit-api"}), 503
        try:
            livekit_url = os.getenv("LIVEKIT_URL")
            livekit_api_key = os.getenv("LIVEKIT_API_KEY")
            livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
            if not all((livekit_url, livekit_api_key, livekit_api_secret)):
                return jsonify({"error": "LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET required in .env"}), 503
            body = request.get_json(silent=True) or {}
            room_name = body.get("roomName") or f"kinetra-{int(time.time())}"
            participant_name = body.get("participantName") or f"user-{os.urandom(4).hex()}"
            raw = body.get("workoutId")
            workout_id = str(raw).strip() if raw is not None and str(raw).strip() else None
            metadata = json.dumps({"workout_id": workout_id}) if workout_id else "{}"
            agent_name = body.get("agentName") or os.getenv("LIVEKIT_AGENT_NAME", "Jordan-d13")
            room_config = api.RoomConfiguration(
                agents=[api.RoomAgentDispatch(agent_name=agent_name, metadata=metadata)]
            )
            token = (
                api.AccessToken(livekit_api_key, livekit_api_secret)
                .with_identity(participant_name)
                .with_name(participant_name)
                .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True))
                .with_room_config(room_config)
                .to_jwt()
            )
            return jsonify({"serverUrl": livekit_url, "participantToken": token}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.get("/workouts")
    def get_workouts():
        """Fetch all workouts from MongoDB"""
        try:
            workouts = get_all_workouts()
            return jsonify({"status": "success", "data": workouts}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

            
    @app.get("/workouts/<workout_id>")
    def get_workout(workout_id):
        """Fetch a specific workout from MongoDB with pressure frames (if available)"""
        try:
            workout = get_workout_by_id(workout_id)
            if not workout:
                return jsonify({"error": "Workout not found"}), 404
            return jsonify({"status": "success", "data": workout}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/workouts")
    def create_new_workout():
        """Create a new workout in MongoDB"""
        try:
            payload = request.get_json(silent=True)
            if not payload:
                print("Error: Missing JSON body")
                return jsonify({"error": "Missing JSON body"}), 400
            
            print(f"Creating workout with payload: {payload}")
            workout = create_workout(payload)
            print(f"Workout created successfully: {workout}")
            return jsonify({"status": "success", "data": workout}), 201
        except Exception as e:
            error_msg = str(e)
            print(f"Error creating workout: {error_msg}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": error_msg}), 500

    @app.put("/workouts/<workout_id>")
    def update_workout_endpoint(workout_id):
        """Update a workout in MongoDB"""
        try:
            payload = request.get_json(silent=True)
            if not payload:
                return jsonify({"error": "Missing JSON body"}), 400
            
            workout = update_workout(workout_id, payload)
            if not workout:
                return jsonify({"error": "Workout not found"}), 404
            return jsonify({"status": "success", "data": workout}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.delete("/workouts/<workout_id>")
    def delete_workout_endpoint(workout_id):
        """Delete a workout from MongoDB"""
        try:
            success = delete_workout(workout_id)
            if not success:
                return jsonify({"error": "Workout not found"}), 404
            return jsonify({"status": "success", "message": "Workout deleted"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/session/start")
    def start_session():
        payload = request.get_json(silent=True) or {}
        return jsonify({"status": "ok", "received": payload})
    # ==================== WebSocket Events ====================
    
    @socketio.on('connect')
    def handle_connect():
        print(f"Client connected: {request.sid}")
        emit('connection_response', {'data': 'Connected to pressure data stream'})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        client_id = request.sid
        print(f"🔴 Client disconnected: {client_id}")
        
        # Clean up all sessions for this client
        sessions_to_remove = []
        for workout_id, session in active_sessions.items():
            if session.get('client_id') == client_id:
                sessions_to_remove.append(workout_id)
                frame_count = session.get('frame_count', 0)
                print(f"🧹 Cleaning up session {workout_id} (client: {client_id}, frames: {frame_count})")
                leave_room(workout_id)
        
        # Remove sessions after iteration
        for workout_id in sessions_to_remove:
            del active_sessions[workout_id]
            ema_state.pop(workout_id, None)
        
        if sessions_to_remove:
            print(f"✅ Cleaned up {len(sessions_to_remove)} session(s) for client {client_id}")
        else:
            print(f"ℹ️ No active sessions found for client {client_id}")
    
    @socketio.on('join_session')
    def on_join_session(data):
        """Client joins a workout session to stream pressure and stats data"""
        workout_id = data.get('workout_id')
        if not workout_id:
            emit('error', {'message': 'Missing workout_id'})
            return
        
        join_room(workout_id)
        active_sessions[workout_id] = {
            'connected': True,
            'frame_count': 0,
            'client_id': request.sid
        }
        print(f"Client {request.sid} joined session {workout_id}")
        emit('session_joined', {'workout_id': workout_id, 'status': 'ready'})
    
    @socketio.on('pressure_frame')
    def on_pressure_frame(data):
        """Receive pressure frame data and save to MongoDB"""
        try:
            workout_id = data.get('workout_id')
            matrix = data.get('matrix')
            nodes = data.get('nodes')
            timestamp = data.get('timestamp')
            
            # Calculate stats from the matrix
            matrix_array = np.array(matrix, dtype=float)
            
            # Split into anatomical regions and compute stats per region
            regions = split_into_regions(matrix_array)
            calculated_stats = calculate_region_stats(regions)
            
            prev_ema = ema_state.get(workout_id)
            smoothed_stats = apply_ema_stats(calculated_stats, prev_ema, EMA_ALPHA)
            if smoothed_stats:
                ema_state[workout_id] = smoothed_stats
                if workout_id in active_sessions:
                    active_sessions[workout_id]['ema_stats'] = smoothed_stats

            # Save pressure data to MongoDB
            events = _get_events_for_save(
                workout_id,
                calculated_stats,
                timestamp=timestamp,
                source='ws_pressure_frame'
            )
            save_pressure_data(
                workout_id, 
                matrix, 
                calculated_stats,
                smoothed_stats=smoothed_stats,
                nodes=nodes, 
                timestamp=timestamp,
                events=events
            )

            # Update session metrics
            if workout_id in active_sessions:
                active_sessions[workout_id]['frame_count'] += 1
            
            emit('frame_processed', {
                'stats': smoothed_stats or calculated_stats,
                'raw_stats': calculated_stats,
                'frame_count': active_sessions.get(workout_id, {}).get('frame_count', 0),
                'timestamp': timestamp
            }, room=workout_id)
            
        except Exception as e:
            print(f"❌ Error processing pressure frame: {e}")
            import traceback
            traceback.print_exc()
            emit('error', {'message': str(e)})

    @socketio.on('stats_frame')
    def on_stats_frame(data):
        """Optionally receive calculated stats from client and persist to MongoDB."""
        try:
            workout_id = data.get('workout_id')
            calculated_stats = data.get('stats')
            timestamp = data.get('timestamp')
            nodes = data.get('nodes')
            matrix = data.get('matrix')
            if not workout_id or not calculated_stats:
                emit('error', {'message': 'Missing workout_id or stats'})
                return
            prev_ema = ema_state.get(workout_id)
            smoothed_stats = apply_ema_stats(calculated_stats, prev_ema, EMA_ALPHA)
            if smoothed_stats:
                ema_state[workout_id] = smoothed_stats
                if workout_id in active_sessions:
                    active_sessions[workout_id]['ema_stats'] = smoothed_stats
            # Persist a stats-only frame (matrix optional)
            events = _get_events_for_save(
                workout_id,
                calculated_stats,
                timestamp=timestamp,
                source='ws_stats_frame'
            )
            save_pressure_data(
                workout_id,
                matrix if matrix is not None else [],
                calculated_stats,
                smoothed_stats=smoothed_stats,
                nodes=nodes,
                timestamp=timestamp,
                events=events
            )
            # Broadcast to session room
            emit('stats_update', {
                'stats': smoothed_stats or calculated_stats,
                'raw_stats': calculated_stats,
                'timestamp': timestamp
            }, room=workout_id)
        except Exception as e:
            print(f"Error saving stats frame: {e}")
            emit('error', {'message': str(e)})
    
    @socketio.on('leave_session')
    def on_leave_session(data):
        """Client leaves the session and data streaming ends"""
        workout_id = data.get('workout_id')
        client_id = request.sid
        if workout_id:
            print(f"👋 Client {client_id} leaving session {workout_id}")
            leave_room(workout_id)
            if workout_id in active_sessions:
                active_sessions[workout_id]['connected'] = False
                frame_count = active_sessions[workout_id]['frame_count']
                print(f"✅ Session {workout_id} ended cleanly. Total frames: {frame_count}")
                del active_sessions[workout_id]
                ema_state.pop(workout_id, None)
            else:
                print(f"ℹ️ Session {workout_id} was already cleaned up")
            emit('session_ended', {'workout_id': workout_id})
        else:
            print(f"⚠️ Leave session called without workout_id by client {client_id}")

    # ==================== MongoDB Change Stream (broadcast) ====================
    def watch_sessions():
        from db import mongodb_available
        if not mongodb_available:
            print('Change stream unavailable: MongoDB not available')
            return
        try:
            with workouts_collection.watch(
                [{ '$match': { 'operationType': 'update' } }],
                full_document='updateLookup'
            ) as stream:
                print('Started MongoDB change stream for workouts')
                for change in stream:
                    full_doc = change.get('fullDocument', {}) or {}
                    workout_id = full_doc.get('_id')
                    frames = full_doc.get('pressure_frames') or []
                    last_frame = frames[-1] if frames else None
                    if workout_id and last_frame:
                        ts = last_frame.get('timestamp')
                        smoothed_stats = last_frame.get('smoothed_stats') or last_frame.get('calculated_stats')
                        socketio.emit('stats_update', {
                            'stats': smoothed_stats,
                            'timestamp': getattr(ts, 'isoformat', lambda: ts)() if ts else ts
                        }, room=str(workout_id))
        except Exception as e:
            print(f'Change stream error: {e}')
            
    

    # Start background change stream watcher once
    socketio.start_background_task(watch_sessions)

    return app, socketio


app, socketio = create_app()

if __name__ == "__main__":
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
