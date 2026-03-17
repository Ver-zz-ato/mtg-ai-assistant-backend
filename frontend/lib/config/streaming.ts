// Streaming chat configuration constants
export const STREAM_HEARTBEAT_MS = 15000; // 15 seconds
export const MAX_STREAM_SECONDS = 120; // 2 minutes max streaming duration
export const MAX_TOKENS_STREAM = 4096; // Max tokens for streaming response (model's typical max)
// No practical cap for deck analysis so full 8-step + Report Card completes (revert to 8192 or MAX_TOKENS_STREAM if needed)
export const MAX_TOKENS_DECK_ANALYSIS = 16384;