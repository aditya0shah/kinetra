# Kinetra AI Coach - LiveKit Integration

## What's Included

This integration provides a **floating AI fitness coach** powered by LiveKit Cloud.

### Frontend Components

- **FloatingAIButton.js** - The only component needed for AI Coach
  - Floating button in bottom-right corner
  - Opens modal with agent interface
  - Handles LiveKit connection
  - Real-time voice interaction

### How It Works

1. **Click floating button** → Opens AI Coach modal
2. **Click "Start Session"** → Connects to LiveKit Sandbox
3. **Start talking** → Agent responds via voice

### Configuration

**LiveKit Sandbox ID**: `kinetra-10sdo0`

The component automatically:
- Connects to LiveKit Cloud (no local setup needed)
- Requests microphone permission
- Handles audio input/output
- Shows agent state (listening/thinking/speaking)

### Dependencies

Required npm packages:
```bash
npm install @livekit/components-react livekit-client @livekit/components-styles
```

Already installed in this project.

### Usage

Just include the `<FloatingAIButton />` component in your app (already in App.js).

The floating button appears on all pages and works independently.

### Optional: Local Agent (Advanced)

If you want to run the agent locally instead of using cloud:

1. Add your OpenAI API key to `backend/.env`
2. Run: `cd backend && source sport/bin/activate && python agent.py dev`

But the **cloud agent is recommended** for production - no local setup needed!

---

**That's it!** The AI Coach is fully integrated and ready to use. 🎤
