/**
 * Supabase-backed AI response cache (two-tier: public + private).
 * Uses stableStringify for canonical key hashing. Bounded lazy cleanup on write.
 * Service role only. No client access.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashString } from "@/lib/guest-tracking";

const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const LAZY_CLEANUP_LIMIT = 100;

export type CacheEntry = {
  text: string;
  usage?: Record<string, unknown>;
  fallback?: boolean;
};

/** Recursively sort object keys for stable JSON stringify. */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => stableStringify(v)).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

/** Normalize user text: trim, collapse whitespace. Lowercase only when caller indicates public intent. */
export function normalizeCacheText(text: string, lowercase = false): string {
  let out = (text || "").trim().replace(/\s+/g, " ");
  if (lowercase) out = out.toLowerCase();
  return out;
}

export type CacheKeyPayload = {
  cache_version: number;
  model: string;
  sysPromptHash: string;
  intent: string;
  normalized_user_text: string;
  deck_context_included: boolean;
  deck_hash: string | null;
  tier: string;
  locale: string | null;
  scope?: string; // user_id or token_hash for private
};

/** Hash canonical payload for cache key. Never store raw prompts.
 * For public cache (no scope), model is excluded from key to improve hit rate across tiers.
 */
export async function hashCacheKey(payload: CacheKeyPayload): Promise<string> {
  const forHash = payload.scope
    ? payload
    : { ...payload, model: '__public__' };
  const canonical = stableStringify(forHash);
  return hashString(canonical);
}

/** Get cached response. Returns undefined if miss or expired. */
export async function supabaseCacheGet<T extends CacheEntry>(
  supabase: SupabaseClient,
  table: "ai_public_cache" | "ai_private_cache",
  key: string
): Promise<T | undefined> {
  const { data, error } = await supabase
    .from(table)
    .select("response_text, response_meta")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return undefined;
  try {
    const meta = (data.response_meta as Record<string, unknown>) || {};
    return {
      text: data.response_text ?? "",
      usage: meta.usage as Record<string, unknown> | undefined,
      fallback: meta.fallback as boolean | undefined,
    } as T;
  } catch {
    return undefined;
  }
}

/** Set cached response. Runs bounded lazy cleanup on each write. */
export async function supabaseCacheSet<T extends CacheEntry>(
  supabase: SupabaseClient,
  table: "ai_public_cache" | "ai_private_cache",
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await supabase.from(table).upsert(
    {
      cache_key: key,
      response_text: value.text,
      response_meta: { usage: value.usage, fallback: value.fallback },
      expires_at: expiresAt,
    },
    { onConflict: "cache_key" }
  );
  await lazyCleanupExpired(supabase, table);
}

/** Bounded lazy cleanup: delete up to LAZY_CLEANUP_LIMIT expired rows. */
async function lazyCleanupExpired(
  supabase: SupabaseClient,
  table: "ai_public_cache" | "ai_private_cache"
): Promise<void> {
  try {
    const { data: toDelete } = await supabase
      .from(table)
      .select("cache_key")
      .lt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(LAZY_CLEANUP_LIMIT);

    if (toDelete?.length) {
      const keys = toDelete.map((r) => (r as { cache_key: string }).cache_key);
      await supabase.from(table).delete().in("cache_key", keys);
    }
  } catch {
    // Non-fatal; cleanup is best-effort
  }
}
