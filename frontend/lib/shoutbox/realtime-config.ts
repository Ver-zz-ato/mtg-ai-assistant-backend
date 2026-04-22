/**
 * Client-side shoutbox realtime strategy (build-time env).
 * - `poll` (default): bounded history polling, no SSE.
 * - `sse`: legacy EventSource to `/api/shout/stream`.
 */
export type ShoutRealtimeMode = "poll" | "sse";

export function getPublicShoutRealtimeMode(): ShoutRealtimeMode {
  const raw = process.env.NEXT_PUBLIC_SHOUT_REALTIME_MODE;
  if (raw === "sse") return "sse";
  return "poll";
}

/** Polling interval when mode is `poll`. Clamped 5s–120s; default 18s. */
export function getPublicShoutPollMs(): number {
  const raw = process.env.NEXT_PUBLIC_SHOUT_POLL_MS;
  const n = raw != null && raw !== "" ? Number.parseInt(String(raw), 10) : Number.NaN;
  if (!Number.isFinite(n)) return 18_000;
  return Math.min(120_000, Math.max(5_000, Math.round(n)));
}
