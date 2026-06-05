export const PUBLIC_VISIBILITY_TOGGLE_COOLDOWN_SECONDS = 5 * 60;

export function getPublicVisibilityCooldown(
  lastToggledAt: string | null | undefined,
  nowMs = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number; message: string } {
  if (!lastToggledAt) return { ok: true };
  const lastMs = Date.parse(lastToggledAt);
  if (!Number.isFinite(lastMs)) return { ok: true };
  const elapsedSeconds = Math.floor((nowMs - lastMs) / 1000);
  const retryAfterSeconds = PUBLIC_VISIBILITY_TOGGLE_COOLDOWN_SECONDS - elapsedSeconds;
  if (retryAfterSeconds <= 0) return { ok: true };
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    ok: false,
    retryAfterSeconds,
    message: `Please wait ${minutes} minute${minutes === 1 ? "" : "s"} before making this public again.`,
  };
}
