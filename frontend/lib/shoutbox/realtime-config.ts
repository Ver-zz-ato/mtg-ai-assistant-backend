/**
 * Client-side shoutbox polling configuration.
 * The legacy SSE mode is retired and cannot be re-enabled by env.
 */
export type ShoutRealtimeMode = "poll";

export function getPublicShoutRealtimeMode(): ShoutRealtimeMode {
  return "poll";
}

/** Polling interval. Clamped 5s-120s; default 15s. */
export function getPublicShoutPollMs(): number {
  const raw = process.env.NEXT_PUBLIC_SHOUT_POLL_MS;
  const n = raw != null && raw !== "" ? Number.parseInt(String(raw), 10) : Number.NaN;
  if (!Number.isFinite(n)) return 15_000;
  return Math.min(120_000, Math.max(5_000, Math.round(n)));
}
