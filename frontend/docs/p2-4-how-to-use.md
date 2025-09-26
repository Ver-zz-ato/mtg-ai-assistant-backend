# P2‑4 proxy route (`/api/chat/messages/post`) — usage

Send a POST with a **JSON** body like:

```json
{ "text": "hello there", "threadId": "optional-id-or-null" }
```

The route forwards that to your existing internal **`/api/chat`** endpoint as:

```json
{ "content": "hello there", "threadId": "optional-id" }
```

It validates the input and returns a consistent JSON envelope:
- success: `{ ok: true, data: … }`
- error: `{ ok: false, error: { code?, message, hint? }, status? }` (with proper HTTP status)

This resolves the `400 Required` and `503 Failed to parse URL from /api/chat` issues that were caused by
mismatched field names and null vs undefined `threadId` handling.
