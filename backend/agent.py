from dotenv import load_dotenv
import os
import json
from typing import Any

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.agents.llm import function_tool
from livekit.plugins import silero, openai
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from db import get_workout_by_id

load_dotenv(".env")

# Global variable to store current workout context
current_workout_context = {}

# Verify environment variables
if not os.getenv("LIVEKIT_URL"):
    raise ValueError("LIVEKIT_URL not found in .env")
if not os.getenv("LIVEKIT_API_KEY"):
    raise ValueError("LIVEKIT_API_KEY not found in .env")
if not os.getenv("LIVEKIT_API_SECRET"):
    raise ValueError("LIVEKIT_API_SECRET not found in .env")
if not os.getenv("OPENAI_API_KEY"):
    raise ValueError("OPENAI_API_KEY not found in .env")


# Define tools for the AI agent to call
async def get_session_info() -> dict:
    """Get information about the current session including the workout ID"""
    try:
        workout_id = current_workout_context.get('workout_id')
        print(f"[DEBUG] Current workout context: {current_workout_context}")
        print(f"[DEBUG] Workout ID found: {workout_id}")
        
        if not workout_id:
            return {
                "error": "No workout ID found in session",
                "session_info": current_workout_context,
                "message": "User may not be viewing a specific workout page"
            }
        return {
            "success": True,
            "workout_id": workout_id,
            "message": f"Found workout ID: {workout_id}"
        }
    except Exception as e:
        return {"error": str(e)}


async def get_workout_id_from_session() -> dict:
    """Retrieve the current workout ID from the active session.
    Use this when the user asks about 'this workout', 'current workout', or 'my workout'.
    """
    try:
        workout_id = current_workout_context.get('workout_id')
        if not workout_id:
            return {
                "error": "No workout ID found in session. User may not be viewing a specific workout.",
                "workout_id": None
            }
        return {
            "success": True,
            "workout_id": workout_id,
            "message": f"Current workout ID is {workout_id}"
        }
    except Exception as e:
        return {"error": str(e)}


async def get_current_workout(workout_id: str) -> dict:
    """Fetch current workout data from MongoDB"""
    try:
        workout = get_workout_by_id(workout_id)
        if not workout:
            return {"error": "Workout not found"}
        # Convert ObjectId to string for JSON serialization
        workout['_id'] = str(workout['_id'])
        
        # Extract all events from pressure_frames
        events = []
        pressure_frames = workout.get("pressure_frames", [])
        for frame in pressure_frames:
            if isinstance(frame, dict) and "events" in frame and frame["events"]:
                events.extend(frame["events"])
        
        return {
            "success": True,
            "workout": workout,
            "events": events,
            "total_events": len(events)
        }
    except Exception as e:
        return {"error": str(e)}


async def analyze_exercise_performance(workout_id: str, metric: str) -> dict:
    """Analyze specific exercise metrics from a workout"""
    try:
        workout = get_workout_by_id(workout_id)
        if not workout:
            return {"error": "Workout not found"}
        
        analysis = {
            "workout_name": workout.get('name'),
            "metric": metric,
        }
        
        # Analyze different metrics
        if metric == "heart_rate":
            analysis["avg_heart_rate"] = workout.get('avgHeartRate', 0)
            analysis["max_heart_rate"] = workout.get('maxHeartRate', 0)
            analysis["insight"] = f"Your average heart rate was {workout.get('avgHeartRate', 0)} bpm with a max of {workout.get('maxHeartRate', 0)} bpm."
        elif metric == "calories":
            analysis["calories_burned"] = workout.get('calories', 0)
            analysis["insight"] = f"You burned {workout.get('calories', 0)} calories during this session."
        elif metric == "distance":
            analysis["distance"] = workout.get('distance', 0)
            analysis["insight"] = f"You covered {workout.get('distance', 0)} distance units in this workout."
        elif metric == "steps":
            analysis["steps"] = workout.get('steps', 0)
            analysis["insight"] = f"You took {workout.get('steps', 0)} steps during this session."
        
        return {"success": True, "analysis": analysis}
    except Exception as e:
        return {"error": str(e)}


async def get_exercise_recommendations(workout_type: str) -> dict:
    """Get exercise recommendations based on workout type"""
    recommendations = {
        "Running": [
            "Start with a warm-up jog to prepare your muscles",
            "Maintain steady breathing rhythm",
            "Focus on proper posture and form",
            "Cool down with a slow walk to reduce heart rate"
        ],
        "Strength": [
            "Warm up with light cardio first",
            "Start with compound movements",
            "Maintain proper form over heavy weight",
            "Rest 60-90 seconds between sets"
        ],
        "Cardio": [
            "Maintain consistent pace",
            "Monitor your heart rate zone",
            "Stay hydrated throughout",
            "Gradually increase intensity"
        ],
        "Yoga": [
            "Focus on breathing and alignment",
            "Don't force stretches",
            "Listen to your body",
            "Move mindfully between poses"
        ]
    }
    
    recs = recommendations.get(workout_type, recommendations.get("Running", []))
    return {
        "success": True,
        "workout_type": workout_type,
        "recommendations": recs
    }


# Decorate functions with @function_tool to make them available to the agent
get_session_info = function_tool(get_session_info)
get_workout_id_from_session = function_tool(get_workout_id_from_session)
get_current_workout = function_tool(get_current_workout)
analyze_exercise_performance = function_tool(analyze_exercise_performance)
get_exercise_recommendations = function_tool(get_exercise_recommendations)

# Tool list for the agent
workout_tools = [
    get_session_info,
    get_workout_id_from_session,
    get_current_workout,
    analyze_exercise_performance,
    get_exercise_recommendations,
]


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are an Coach Josh, the BEST AI FITNESS COACH, for Kinetra, a smart fitness tracking platform.
            You help users with workout guidance, exercise form tips, and motivation.
            You have access to their current workout data and can analyze their performance metrics.
            
            When users ask about their workout:
            1. First use get_workout_id_from_session to get the current workout ID from the session
            2. Then use get_current_workout with that workout ID to fetch their workout data
            3. Use analyze_exercise_performance to analyze specific metrics
            4. Use get_exercise_recommendations for form and technique tips
            
            Provide personalized insights based on their actual data.
            Your responses are concise, encouraging, and conversational - like talking to a friendly personal trainer.
            You don't use complex formatting, emojis, or asterisks in speech.
            You're knowledgeable about fitness, exercises, and helping people reach their goals.""",
        )

server = AgentServer()

@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    # Extract workout_id from room name or participant metadata
    global current_workout_context
    
    # First, try to extract from room name (format: kinetra-session-workout-{id}-{timestamp})
    room_name = ctx.room.name
    workout_id = None
    
    if room_name and 'workout-' in room_name:
        try:
            # Extract workout ID from room name
            parts = room_name.split('workout-')
            if len(parts) > 1:
                id_part = parts[1].split('-')[0]
                if id_part and id_part != 'session':
                    workout_id = id_part
                    current_workout_context['workout_id'] = workout_id
                    print(f"✓ Extracted workout_id from room name: {workout_id}")
        except Exception as e:
            print(f"Failed to extract workout_id from room name: {e}")
    
    # Set up event handler to extract metadata when participant connects (backup method)
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        if participant.metadata and not current_workout_context.get('workout_id'):
            try:
                metadata = json.loads(participant.metadata)
                extracted_id = metadata.get('workout_id')
                if extracted_id:
                    current_workout_context['workout_id'] = extracted_id
                    print(f"✓ Extracted workout_id from participant metadata: {extracted_id}")
            except json.JSONDecodeError as e:
                print(f"Failed to parse participant metadata: {e}")
    
    # Connect to the room
    await ctx.connect()
    
    # If still no workout ID, try to get from existing participants
    if not current_workout_context.get('workout_id'):
        for participant in ctx.room.remote_participants.values():
            if participant.metadata:
                try:
                    metadata = json.loads(participant.metadata)
                    extracted_id = metadata.get('workout_id')
                    if extracted_id:
                        current_workout_context['workout_id'] = extracted_id
                        print(f"✓ Extracted workout_id from existing participant: {extracted_id}")
                        break
                except json.JSONDecodeError:
                    pass
    
    session = AgentSession(
        stt="assemblyai/universal-streaming:en",
        llm=openai.LLM(model="gpt-4.1-mini"),
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(language="en"),
        tools=workout_tools,  # Add tools to the session
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
    )

    await session.generate_reply(
        instructions="Greet the user and let them know you can help them with their workout data and provide exercise recommendations."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)