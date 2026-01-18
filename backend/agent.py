from dotenv import load_dotenv
import json
import logging
import os
import sys
from typing import Any

# Load .env and silence noisy loggers before importing db (MongoClient) or livekit
_backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_backend_dir, ".env"))

# Reduce noisy logs (avoids lag and log flood). pymongo set before db import.
for _name in ("livekit.agents", "livekit", "aiohttp"):
    logging.getLogger(_name).setLevel(logging.WARNING)
for _name in ("pymongo", "pymongo.topology"):
    logging.getLogger(_name).setLevel(logging.ERROR)  # topology heartbeats are DEBUG

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent
from livekit.agents.llm import function_tool
from livekit.plugins import silero, openai
from db import get_workout_by_id

_log = logging.getLogger("kinetra.agent")
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
async def get_workout_id_from_session() -> dict:
    """Retrieve the current workout ID from the session (when the user is viewing an episode). Returns workout_id or asks them to open a workout."""
    try:
        workout_id = current_workout_context.get("workout_id")
        if not workout_id:
            return {
                "success": False,
                "workout_id": None,
                "message": "No workout in session. Ask the user to open a workout or episode first.",
            }
        return {
            "success": True,
            "workout_id": str(workout_id),
            "message": f"Current workout ID: {workout_id}",
        }
    except Exception as e:
        return {"success": False, "error": str(e), "workout_id": None}


def _resolve_workout_id(workout_id: str | None) -> str | None:
    """Resolve workout_id from argument or current_workout_context. Returns a non-empty string or None."""
    if workout_id is not None and str(workout_id).strip():
        return str(workout_id).strip()
    v = current_workout_context.get("workout_id")
    return str(v).strip() if v else None


async def get_current_workout(workout_id: str | None = None) -> dict:
    """Query MongoDB for the workout. Pass workout_id from get_workout_id_from_session, or omit to use the session workout.
    Returns: workout (name, metrics, pressure_frames), all_events, events_summary (counts by type and region), total_events. Use this to inform the user about their workout."""
    try:
        wid = _resolve_workout_id(workout_id)
        if not wid:
            return {
                "success": False,
                "error": "No workout ID. User is not viewing a workout. Ask them to open an episode first.",
            }
        workout = get_workout_by_id(wid)
        if not workout:
            return {"success": False, "error": "Workout not found"}
        if workout.get("_id") is not None:
            workout["_id"] = str(workout["_id"])

        def _json_safe(d: dict) -> dict:
            out = {}
            for k, v in d.items():
                if hasattr(v, "isoformat"):
                    out[k] = v.isoformat()
                elif isinstance(v, dict):
                    out[k] = _json_safe(v)
                else:
                    out[k] = v
            return out

        all_events: list[dict[str, Any]] = []
        for frame in workout.get("pressure_frames") or []:
            if isinstance(frame, dict) and frame.get("events"):
                for e in frame["events"]:
                    if isinstance(e, dict):
                        all_events.append(_json_safe(e))
        for e in workout.get("events") or []:
            if isinstance(e, dict):
                all_events.append(_json_safe(e))

        by_type: dict[str, int] = {}
        by_region: dict[str, int] = {}
        for e in all_events:
            t = e.get("type") or "unknown"
            by_type[t] = by_type.get(t, 0) + 1
            r = e.get("region") or "unknown"
            by_region[r] = by_region.get(r, 0) + 1
        events_summary = {
            "by_type": by_type,
            "by_region": by_region,
            "total": len(all_events),
        }

        return {
            "success": True,
            "workout": workout,
            "all_events": all_events,
            "events_summary": events_summary,
            "total_events": len(all_events),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# Decorate functions with @function_tool to make them available to the agent
get_workout_id_from_session = function_tool(get_workout_id_from_session)
get_current_workout = function_tool(get_current_workout)

# Tool list for the agent: 1) get workout ID from session, 2) query MongoDB for workout info
workout_tools = [
    get_workout_id_from_session,
    get_current_workout,
]


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are Coach Josh, the AI fitness coach for Kinetra. Use only these 2 tools to get real data. Never guess or make up workout details.

            TOOLS:
            1. get_workout_id_from_session() — Returns the current workout ID when the user is viewing an episode. If no workout in session, ask them to open a workout first.
            2. get_current_workout(workout_id=None) — Queries MongoDB for the workout. Pass a workout_id from tool 1, or omit to use the session workout. Returns: workout (name, metrics, pressure_frames), all_events, events_summary (counts by type and region), total_events. Use this information to inform the user about their workout.

            RULES:
            - For any question about the user's workout, session, or how they did: call get_workout_id_from_session() then get_current_workout(workout_id=...) with that ID; or call get_current_workout() with no args to use the session. Use the returned workout and event data to answer.
            - If a tool says no workout in session, ask the user to open a workout or episode first.
            - Be concise, encouraging, and conversational. No complex formatting, emojis, or asterisks in speech.
            - given the data from the wokrouts, provide insights on injuries from pressure points and where to be careful""",
        )

server = AgentServer()

@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME", "Jordan-d13"))
async def my_agent(ctx: agents.JobContext):
    # Extract workout_id from job metadata, room name, or participant metadata
    global current_workout_context
    
    workout_id = None
    
    # 1) Job metadata (from agent_dispatch when frontend passes workout_id)
    job = getattr(ctx, "job", None)
    if job and getattr(job, "metadata", None) and job.metadata:
        try:
            meta = json.loads(job.metadata)
            workout_id = meta.get("workout_id")
            if workout_id:
                current_workout_context["workout_id"] = workout_id
                _log.debug("workout_id from job metadata: %s", workout_id)
        except (json.JSONDecodeError, TypeError):
            pass

    # 2) Room name (format: kinetra-session-workout-{id}-{timestamp})
    room_name = ctx.room.name
    if not workout_id and room_name and "workout-" in room_name:
        try:
            parts = room_name.split("workout-")
            if len(parts) > 1:
                id_part = parts[1].split("-")[0]
                if id_part and id_part != "session":
                    workout_id = id_part
                    current_workout_context["workout_id"] = workout_id
                    _log.debug("workout_id from room name: %s", workout_id)
        except Exception as e:
            _log.debug("parse workout_id from room name: %s", e)

    # Set up event handler to extract metadata when participant connects (backup)
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        if participant.metadata and not current_workout_context.get("workout_id"):
            try:
                meta = json.loads(participant.metadata)
                wid = meta.get("workout_id")
                if wid:
                    current_workout_context["workout_id"] = wid
                    _log.debug("workout_id from participant metadata: %s", wid)
            except json.JSONDecodeError:
                pass
    
    # Connect to the room
    await ctx.connect()
    
    # If still no workout ID, try existing participants
    if not current_workout_context.get("workout_id"):
        for participant in ctx.room.remote_participants.values():
            if participant.metadata:
                try:
                    meta = json.loads(participant.metadata)
                    wid = meta.get("workout_id")
                    if wid:
                        current_workout_context["workout_id"] = wid
                        _log.debug("workout_id from existing participant: %s", wid)
                        break
                except json.JSONDecodeError:
                    pass
    
    session = AgentSession(
        stt=openai.STT(model="gpt-4o-transcribe", language="en"),
        llm=openai.LLM(model="gpt-4.1-mini"),
        tts=openai.TTS(model="gpt-4o-mini-tts", voice="ash", instructions="Speak in a friendly, encouraging tone as a fitness coach."),
        vad=silero.VAD.load(),
        turn_detection="stt",
        tools=workout_tools,
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
    )

    await session.generate_reply(
        instructions="Greet the user briefly and offer to help with their workout. If a workout is in context, call get_current_workout() so you can speak from real data when they ask."
    )


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd in ("start", "dev") and os.getenv("LIVEKIT_URL"):
        print("LiveKit: %s — 401? Run: python check_livekit.py" % os.getenv("LIVEKIT_URL"), file=sys.stderr)
    # Re-apply pymongo suppression in case CLI sets root/other to DEBUG
    logging.getLogger("pymongo").setLevel(logging.ERROR)
    logging.getLogger("pymongo.topology").setLevel(logging.ERROR)
    agents.cli.run_app(server)