# User Steering

Type messages while the agent is running. They get queued and injected into the conversation mid-stream.

## How It Works

1. User types a message while the agent is busy (loading indicator visible)
2. Message is queued (up to 5 messages, shown in UI with "queued" label)
3. At the next `prepareStep` call (between agent steps), `drainSteering()` pops the first queued message
4. Message is injected as `[user steering] <content>` into the conversation
5. Agent sees the steering and adjusts its approach

## Architecture

```
User types while loading
        │
        ▼
  messageQueue (state)
  messageQueueRef (ref)
        │
        ▼  prepareStep calls drainSteering()
  Injected into messages as:
  { role: "user", content: "[user steering] fix the types too" }
        │
        ▼
  Agent processes in next step
```

## Safety

- **Abort gate:** `steeringAbortedRef` prevents drainSteering from firing after Ctrl+X
- **Ref sync:** `messageQueueRef.current = []` set directly in abort handler
- **Queue cap:** Maximum 5 queued messages (enforced in onQueue callback)
- **Post-completion drain:** After stream ends, remaining queue is auto-submitted as the next message
- **Plan-aware:** Queue survives across plan revision/execution continuations

## UI

Queued messages appear below the chat with a left rail border and "queued" label. They disappear as they're consumed by the agent or cleared on abort.
