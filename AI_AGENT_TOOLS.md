# AI Agent Tool Calling Guide

## Overview

The AI Fitness Coach now has **tool calling capabilities** to access your workout data and provide personalized insights.

## Available Tools

### 1. `get_current_workout(workout_id)`
Fetches detailed workout data from MongoDB
```
Agent: "Tell me about my current workout"
→ Agent calls get_current_workout("696cccc83cd61fb737034d1d")
→ Returns: { name, type, duration, calories, heart_rate, etc. }
```

### 2. `analyze_exercise_performance(workout_id, metric)`
Analyzes specific performance metrics
```
Agent: "How many calories did I burn?"
→ Agent calls analyze_exercise_performance("696cccc83cd61fb737034d1d", "calories")
→ Returns: { calories_burned, insight }
```

**Available metrics:**
- `heart_rate` - Average and max heart rate
- `calories` - Calories burned
- `distance` - Distance covered
- `steps` - Steps taken

### 3. `get_exercise_recommendations(workout_type)`
Provides exercise recommendations based on type
```
Agent: "Give me tips for running"
→ Agent calls get_exercise_recommendations("Running")
→ Returns: [tips array]
```

**Supported workout types:**
- Running
- Strength
- Cardio
- Yoga

## How to Pass Workout Context from Frontend

### Option 1: Pass via Room Metadata (Recommended)

When connecting to the agent, include the workout ID in metadata:

```javascript
// In FloatingAIButton.js - update the room_config
const response = await fetch(SANDBOX_API, {
  method: 'POST',
  headers: {
    'X-Sandbox-ID': SANDBOX_ID,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    room_name: `kinetra-session-${Date.now()}`,
    participant_name: `user-${Math.random().toString(36).substring(7)}`,
    room_config: {
      agent_dispatch: {
        agent_name: 'voice-assistant',
        metadata: JSON.stringify({ 
          type: 'fitness-coach',
          workout_id: currentWorkoutId,  // Pass workout ID here
          workout_type: 'Running'        // Pass workout type here
        }),
      },
    },
  }),
});
```

### Option 2: Pass via URL Parameters

```javascript
// When creating agent session, include workout ID in room name
room_name: `kinetra-session-${currentWorkoutId}-${Date.now()}`
```

The agent can parse the room name to extract the workout ID.

## Example Usage

### User asks: "How did I do on this workout?"
```
Agent Flow:
1. User: "How did I do on this workout?"
2. Agent recognizes it needs workout data
3. Agent calls: get_current_workout(workout_id)
4. MongoDB returns: workout data
5. Agent analyzes and responds: "You completed a 30-minute running session, 
   burned 250 calories, and maintained an average heart rate of 140 bpm. 
   Great effort!"
```

### User asks: "Give me form tips for running"
```
Agent Flow:
1. User: "Give me form tips for running"
2. Agent calls: get_exercise_recommendations("Running")
3. Returns: [tips]
4. Agent responds with personalized recommendations
```

### User asks: "What's my max heart rate?"
```
Agent Flow:
1. User: "What's my max heart rate?"
2. Agent calls: analyze_exercise_performance(workout_id, "heart_rate")
3. Returns: { avg_heart_rate: 140, max_heart_rate: 165 }
4. Agent responds: "Your max heart rate during this session was 165 bpm"
```

## How Tool Calling Works

1. **User speaks to agent**
2. **LLM (GPT-4 mini) analyzes the message** and determines if tools are needed
3. **Agent calls the appropriate tool** with required parameters
4. **Tool returns data** from MongoDB or generates recommendations
5. **LLM processes the response** and speaks to the user with insights

## Adding More Tools

To add a new tool:

```python
def my_custom_tool(param1: str, param2: int) -> dict:
    """Description of what this tool does"""
    try:
        # Your logic here
        return {"success": True, "result": data}
    except Exception as e:
        return {"error": str(e)}

# Add to workout_tools list in agent.py:
workout_tools = [
    Tool(
        callable=my_custom_tool,
        description="What this tool does",
        auto_execute=False,
    ),
    # ... existing tools
]
```

## Best Practices

1. **Keep tool descriptions clear** - LLM uses these to decide when to call
2. **Return consistent JSON** - Always include "success" or "error" field
3. **Handle errors gracefully** - Return helpful error messages
4. **Test tools independently** - Before adding to agent
5. **Document parameters** - Add type hints and docstrings

## Example Integration with Frontend

```javascript
// In EpisodeDetail.js or similar
import FloatingAIButton from './FloatingAIButton';

const workoutId = useParams().id;

<FloatingAIButton workoutId={workoutId} />
```

Then in FloatingAIButton.js:

```javascript
const AICoachModal = ({ onClose, workoutId }) => {
  // Pass workoutId when connecting
  const connectToAgent = async () => {
    const response = await fetch(SANDBOX_API, {
      // ... 
      body: JSON.stringify({
        room_config: {
          agent_dispatch: {
            agent_name: 'voice-assistant',
            metadata: JSON.stringify({ 
              type: 'fitness-coach',
              workout_id: workoutId,
            }),
          },
        },
      }),
    });
  };
};
```

---

**That's it!** Your AI coach now has access to workout data and can provide personalized insights. 🎤💪
