// Streaming chat configuration constants
export const STREAM_HEARTBEAT_MS = 15000; // 15 seconds
export const MAX_STREAM_SECONDS = 120; // 2 minutes max streaming duration
export const MAX_TOKENS_STREAM = 4096; // Max tokens for streaming response (model's typical max)
// Temporary/test-friendly: higher cap for full deck analysis so 8-step + Report Card doesn't truncate (revert to same as MAX_TOKENS_STREAM if needed)
export const MAX_TOKENS_DECK_ANALYSIS = 8192;