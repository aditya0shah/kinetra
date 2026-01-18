#!/usr/bin/env python3
"""
Verify LiveKit credentials in backend/.env.
Run before `agent.py start` if you see 401 errors.

  python check_livekit.py
"""
import asyncio
import os
import sys

# Load backend/.env
_backend_dir = os.path.dirname(os.path.abspath(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(_backend_dir, ".env"))

URL = os.getenv("LIVEKIT_URL")
KEY = os.getenv("LIVEKIT_API_KEY")
SECRET = os.getenv("LIVEKIT_API_SECRET")


def _bail(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if not URL:
        _bail("LIVEKIT_URL is not set in backend/.env")
    if not KEY or not SECRET:
        _bail("LIVEKIT_API_KEY or LIVEKIT_API_SECRET is not set in backend/.env")

    async def _check() -> bool:
        from livekit import api
        from livekit.api import TwirpError
        from livekit.protocol.room import ListRoomsRequest

        lk = api.LiveKitAPI(url=URL, api_key=KEY, api_secret=SECRET)
        try:
            await lk.room.list_rooms(ListRoomsRequest())
            return True
        except TwirpError as e:
            if e.status == 401 or (e.code or "").lower() == "unauthenticated":
                return False
            raise
        except Exception as e:
            if "401" in str(e) or "unauthenticated" in str(e).lower():
                return False
            raise
        finally:
            await lk.aclose()

    try:
        ok = asyncio.run(_check())
    except ImportError as e:
        _bail("LiveKit API not available. Install: pip install livekit-api")
    except Exception as e:
        _bail(f"LiveKit request failed: {e}")

    if not ok:
        _bail("""LiveKit returned 401: your API key/secret are not valid for this project.

Fix:
  1. Open https://cloud.livekit.io
  2. Select the project for: """ + URL + """
  3. Project settings → API Keys
  4. Create a new key (or copy an existing one)
  5. Put in backend/.env:
       LIVEKIT_API_KEY=<key>
       LIVEKIT_API_SECRET=<secret>
  6. Run this script again: python check_livekit.py
""")

    print("LiveKit credentials OK for", URL)


if __name__ == "__main__":
    main()
