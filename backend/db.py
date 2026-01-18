"""
MongoDB database connection and utilities
"""
import os
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime

# Load environment variables
load_dotenv()

print("MONGODB_URI", os.getenv("MONGODB_URI"))
MONGODB_URI = os.getenv("MONGODB_URI")

# Global variables
client = None
db = None
workouts_collection = None
mongodb_available = False

if MONGODB_URI:
    try:
        # Initialize MongoDB client with longer timeout for network issues
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000)

        # Verify connection with explicit timeout
        client.admin.command('ping', maxTimeMS=5000)
        print("✓ Connected to MongoDB successfully")

        # Database and collections
        db = client['kinetra']
        workouts_collection = db['workouts']
        mongodb_available = True

    except Exception as e:
        print(f"⚠ MongoDB connection failed: {e}")
        mongodb_available = False
else:
    print("⚠ MONGODB_URI not set - MongoDB unavailable")


def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    if isinstance(doc, dict):
        doc = dict(doc)  # Create a copy
        if '_id' in doc:
            doc['_id'] = str(doc['_id'])
        # Convert datetime objects to ISO format strings
        for key, value in doc.items():
            if hasattr(value, 'isoformat'):
                doc[key] = value.isoformat()
        return doc
    return doc


def create_workout(workout_data):
    """Create a new workout in the database"""
    if not mongodb_available:
        raise Exception("MongoDB not available")
    
    workout = {
        **workout_data,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }
    result = workouts_collection.insert_one(workout)
    return serialize_doc(workouts_collection.find_one({'_id': result.inserted_id}))


def get_all_workouts():
    """Fetch all workouts from the database"""
    if not mongodb_available:
        raise Exception("MongoDB not available")

    workouts = list(workouts_collection.find().sort('created_at', -1))
    return [serialize_doc(w) for w in workouts]


def get_workout_by_id(workout_id):
    """Fetch a specific workout by ID"""
    if not mongodb_available:
        raise Exception("MongoDB not available")

    try:
        workout = workouts_collection.find_one({'_id': ObjectId(workout_id)})
        return serialize_doc(workout)
    except Exception as e:
        raise e


def update_workout(workout_id, updates):
    """Update a workout in the database"""
    if not mongodb_available:
        raise Exception("MongoDB not available")
    
    try:
        result = workouts_collection.find_one_and_update(
            {'_id': ObjectId(workout_id)},
            {'$set': {**updates, 'updated_at': datetime.utcnow()}},
            return_document=True
        )
        return serialize_doc(result)
    except:
        return None


def delete_workout(workout_id):
    """Delete a workout from the database"""
    if not mongodb_available:
        raise Exception("MongoDB not available")
    
    try:
        result = workouts_collection.delete_one({'_id': ObjectId(workout_id)})
        return result.deleted_count > 0
    except:
        return False


def save_pressure_data(workout_id, pressure_matrix, calculated_stats, smoothed_stats=None, nodes=None, timestamp=None, events=None):
    """Save pressure data and calculated stats for a workout.

    Args:
        workout_id: ID of the workout/session this frame belongs to.
        pressure_matrix: 2D list representing the 4x4 pressure matrix.
        calculated_stats: Dict of region stats calculated on the backend.
        nodes: Optional list of node objects with positions and pressures.
        timestamp: Optional epoch ms or ISO timestamp for the frame.
    """
    if not mongodb_available or workouts_collection is None:
        raise Exception("MongoDB not available")

    try:
        # Normalize timestamp: if provided, convert epoch ms to datetime; else use server time
        ts = timestamp

        # Create pressure frame document
        pressure_frame = {
            'pressure_matrix': pressure_matrix,
            'calculated_stats': calculated_stats,
            'timestamp': ts,
        }
        if smoothed_stats is not None:
            pressure_frame['smoothed_stats'] = smoothed_stats

        print(f"🧾 Saving pressure data to MongoDB")

        # Include nodes if provided
        if nodes is not None:
            pressure_frame['nodes'] = nodes
        if events:
            pressure_frame['events'] = events

        # Append frame to the workout document
        result = workouts_collection.update_one(
            {'_id': ObjectId(workout_id)},
            {
                '$push': {'pressure_frames': pressure_frame},
                '$set': {'updated_at': datetime.utcnow()},
            }
        )
        return result.modified_count > 0
    except Exception as e:
        print(f"Error saving pressure data: {e}")
        raise e


