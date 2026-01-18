from dotenv import load_dotenv
import os

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv(".env")

# Verify environment variables
if not os.getenv("LIVEKIT_URL"):
    raise ValueError("LIVEKIT_URL not found in .env")
if not os.getenv("LIVEKIT_API_KEY"):
    raise ValueError("LIVEKIT_API_KEY not found in .env")
if not os.getenv("LIVEKIT_API_SECRET"):
    raise ValueError("LIVEKIT_API_SECRET not found in .env")
if not os.getenv("OPENAI_API_KEY"):
    raise ValueError("OPENAI_API_KEY not found in .env")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are an Coach Josh, the BEST AI FITNESS COACH, for Kinetra, a smart fitness tracking platform.
            You help users with workout guidance, exercise form tips, and motivation.
            Your responses are concise, encouraging, and conversational - like talking to a friendly personal trainer.
            You don't use complex formatting, emojis, or asterisks in speech.
            You're knowledgeable about fitness, exercises, and helping people reach their goals.""",
        )

server = AgentServer()

@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    session = AgentSession(
        stt="assemblyai/universal-streaming:en",
        llm="openai/gpt-4.1-mini",
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
    )

    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)