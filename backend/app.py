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
        save_session_stats,
        save_pressure_data,
        sessions_collection,
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

            # Attach pressure frames if sessions collection is available
            try:
                if sessions_collection is not None:
                    pressure_frames = list(
                        sessions_collection.find({"workout_id": workout_id}).sort("timestamp", 1)
                    )
                    def serialize_frame(frame):
                        ts = frame.get("timestamp")
                        # Ensure timestamp is JSON-serializable
                        if hasattr(ts, "isoformat"):
                            ts = ts.isoformat()
                        return {
                            "matrix": frame.get("pressure_matrix", []),
                            "stats": frame.get("calculated_stats", {}),
                            "timestamp": ts,
                            "nodes": frame.get("nodes", []),
                        }

                    workout["pressure_frames"] = [serialize_frame(f) for f in pressure_frames]
            except Exception:
                # Non-fatal; continue without frames
                pass

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
        print(f"Client disconnected: {request.sid}")
    
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
            
            print(f"📥 Received pressure_frame for workout: {workout_id}, matrix size: {len(matrix) if matrix else 0}")
            
            if not workout_id or not matrix:
                print(f"❌ Missing data - workout_id: {workout_id}, matrix: {matrix is not None}")
                emit('error', {'message': 'Missing workout_id or matrix'})
                return
            
            # Calculate stats from the matrix
            matrix_array = np.array(matrix, dtype=float)
            if matrix_array.size == 0:
                print("❌ Empty matrix")
                emit('error', {'message': 'Invalid matrix'})
                return
            
            # Split into anatomical regions and compute stats per region
            regions = split_into_regions(matrix_array)
            calculated_stats = calculate_region_stats(regions)
            print(f"✅ Calculated stats for {len(calculated_stats)} regions")
            
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
            
            # Send calculated stats back to all connected clients for this session
            print(f"📤 Emitting frame_processed to room: {workout_id}")
            emit('frame_processed', {
                'stats': calculated_stats,
                'frame_count': active_sessions.get(workout_id, {}).get('frame_count', 0),
                'timestamp': timestamp
            }, room=workout_id)
            
            print(f"✅ Frame {active_sessions.get(workout_id, {}).get('frame_count', 0)} processed for workout {workout_id}")
            
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
        if workout_id:
            leave_room(workout_id)
            if workout_id in active_sessions:
                active_sessions[workout_id]['connected'] = False
                frame_count = active_sessions[workout_id]['frame_count']
                print(f"Session {workout_id} ended. Total frames: {frame_count}")
                del active_sessions[workout_id]
            emit('session_ended', {'workout_id': workout_id})

    # ==================== MongoDB Change Stream (broadcast) ====================
    def watch_sessions():
        from db import mongodb_available
        if not mongodb_available or sessions_collection is None:
            print('Change stream unavailable: MongoDB not available')
            return
        try:
            with sessions_collection.watch([{ '$match': { 'operationType': 'insert' } }]) as stream:
                print('Started MongoDB change stream for sessions')
                for change in stream:
                    full_doc = change.get('fullDocument', {})
                    workout_id = full_doc.get('workout_id')
                    stats = full_doc.get('calculated_stats')
                    ts = full_doc.get('timestamp')
                    if workout_id and stats:
                        # Emit stats_update to the workout room
                        socketio.emit('stats_update', {
                            'stats': stats,
                            'timestamp': getattr(ts, 'isoformat', lambda: ts)() if ts else None
                        }, room=workout_id)
        except Exception as e:
            print(f'Change stream error: {e}')

    # Start background change stream watcher once
    socketio.start_background_task(watch_sessions)

    return app, socketio


app, socketio = create_app()

if __name__ == "__main__":
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
