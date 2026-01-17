import json

from backend.stats import calculate_region_stats, split_into_regions
from flask import Flask, jsonify, request
import numpy as np

def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index():
        return jsonify({"status": "ok", "message": "Flask backend running"})

    @app.get("/health")
    def health():
        return jsonify({"status": "healthy"})

    @app.get("/stats")
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

        parsed = np.array(parsed)
        print(f"Inside call {parsed}")
        regions = split_into_regions(parsed)
        print(regions)
        stats = calculate_region_stats(regions)
        print(stats)

        return jsonify({"status": "ok", "matrix": stats})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)