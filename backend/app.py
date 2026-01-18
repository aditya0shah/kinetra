import json
import sys
import os
from stats import calculate_region_stats, split_into_regions
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

# Load environment variables
load_dotenv()

def create_app() -> Flask:
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # Track active sessions
    active_sessions = {}  # {workout_id: {'connected': bool, 'frame_count': int}}

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

    @app.post("/stats")  # Calculate stats for one matrix frame
    def matrix():
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify({"error": "Missing JSON body"}), 400

        parsed = payload.get("matrix")
        if parsed is None:
            return jsonify({"error": "Missing required field: matrix"}), 400

        if not isinstance(parsed, list) or not all(
            isinstance(row, list) for row in parsed
        ):
            return jsonify({"error": "matrix must be a 2D array"}), 400
        
        try:
            # Convert matrix to numpy array for calculation
            matrix_array = np.array(parsed, dtype=float)
            
            # Calculate stats using stats.py functions
            regions = split_into_regions(matrix_array)
            calculated_stats = calculate_region_stats(regions)
            
            # Save pressure data to database (required)
            workout_id = payload.get("session_id")
            if not workout_id:
                return jsonify({"error": "Missing required field: session_id"}), 400

            nodes = payload.get("nodes")
            timestamp = payload.get("timestamp")
            save_pressure_data(workout_id, parsed, calculated_stats, nodes=nodes, timestamp=timestamp)
            
            # Return the calculated stats to frontend for visualization
            return jsonify({
                "status": "success",
                "data": {
                    "matrix": parsed,
                    "stats": calculated_stats
                }
            }), 200
            
        except Exception as e:
            print(f"Error calculating stats: {e}")
            return jsonify({"error": str(e)}), 500

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
            
            # Save pressure data to MongoDB
            save_pressure_data(
                workout_id, 
                matrix, 
                calculated_stats, 
                nodes=nodes, 
                timestamp=timestamp
            )
            
            # Update session metrics
            if workout_id in active_sessions:
                active_sessions[workout_id]['frame_count'] += 1
            
            emit('frame_processed', {
                'stats': calculated_stats,
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
            # Persist a stats-only frame (matrix optional)
            save_pressure_data(
                workout_id,
                matrix if matrix is not None else [],
                calculated_stats,
                nodes=nodes,
                timestamp=timestamp
            )
            # Broadcast to session room
            emit('stats_update', {
                'stats': calculated_stats,
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
                        socketio.emit('stats_update', {
                            'stats': last_frame.get('calculated_stats'),
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
