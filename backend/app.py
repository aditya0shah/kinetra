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
import numpy as np
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_app() -> Flask:
    app = Flask(__name__)

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
            
            return jsonify({"status": "success", "data": workout}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/workouts")
    def create_new_workout():
        """Create a new workout in MongoDB"""
        try:
            payload = request.get_json(silent=True)
            if not payload:
                return jsonify({"error": "Missing JSON body"}), 400
            
            workout = create_workout(payload)
            return jsonify({"status": "success", "data": workout}), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500

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

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)