# MTG Coach — AI route hotfix (GPT‑5 Responses)

This replaces your `app/api/chat/route.ts` so it works with **GPT‑5** using the **Responses API**.

## Why this fix?
- `max_tokens` → **`max_completion_tokens`** (required by GPT‑5)
- `temperature` **must not be set** (GPT‑5 only supports the default)
- Robust response parsing (`output_text`, `output[0].content[0].text`, legacy shapes)
- Optional `?chatdebug=1` to see the raw OpenAI request/response

## Install
1. Unzip into your repo root, merging `app/api/chat/route.ts` (create folders if missing).
2. Ensure `OPENAI_API_KEY` is set (e.g. in `.env.local`):
   ```env
   OPENAI_API_KEY=sk-...
   ```
3. Restart dev server.

## Test quickly
```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H "content-type: application/json" \
  -d '{"text":"any tips on green decks?","prefs":{"mode":"deck","format":"Commander","plan":"Optimized","colors":["G"],"currency":"USD"}}' | jq
```

Debug view:
```
curl -s "http://localhost:3000/api/chat?chatdebug=1" \
  -H "content-type: application/json" \
  -d '{"text":"hello","prefs":{"format":"Commander"}}' | jq
```

## Request body (expected)
```json
{
  "text": "your message",
  "threadId": null,
  "prefs": {
    "mode": "deck",
    "format": "Commander",
    "plan": "Optimized",
    "colors": ["W","U","B","R","G"],
    "currency": "USD"
  }
}
```

## Response shape
```json
{ "ok": true, "text": "assistant reply...", "threadId": null }
```

If something goes wrong:
```json
{ "ok": false, "error": "AI call failed" }
```
