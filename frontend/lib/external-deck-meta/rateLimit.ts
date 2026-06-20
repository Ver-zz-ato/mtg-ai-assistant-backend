import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalDeckSourceRow } from "./types";

export function isSourceCoolingDown(source: Pick<ExternalDeckSourceRow, "cooldown_until">, now = new Date()): boolean {
  if (!source.cooldown_until) return false;
  const t = Date.parse(source.cooldown_until);
  return Number.isFinite(t) && t > now.getTime();
}

export function retryAfterToCooldownIso(value: string | null, fallbackHours: number): string {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > Date.now()) return new Date(parsed).toISOString();
  }
  return new Date(Date.now() + fallbackHours * 60 * 60 * 1000).toISOString();
}

export async function markSourceSuccess(admin: SupabaseClient, sourceKey: string): Promise<void> {
  await admin
    .from("external_deck_sources")
    .update({
      last_fetched_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("source_key", sourceKey);
}

export async function markSourceFailure(
  admin: SupabaseClient,
  source: Pick<ExternalDeckSourceRow, "source_key" | "consecutive_failures">,
  error: string,
  opts?: { cooldownUntil?: string | null; disable?: boolean }
): Promise<void> {
  const failures = (source.consecutive_failures ?? 0) + 1;
  const patch: Record<string, unknown> = {
    last_fetched_at: new Date().toISOString(),
    last_error: error.slice(0, 500),
    consecutive_failures: failures,
    updated_at: new Date().toISOString(),
  };
  if (opts?.disable) patch.enabled = false;
  if (opts?.cooldownUntil) {
    patch.cooldown_until = opts.cooldownUntil;
  } else if (failures >= 3) {
    patch.cooldown_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
  await admin
    .from("external_deck_sources")
    .update(patch)
    .eq("source_key", source.source_key);
}

export async function politeDelay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
