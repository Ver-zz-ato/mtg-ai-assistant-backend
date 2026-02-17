/**
 * Admin-only mulligan advice cache.
 * Uses Supabase mulligan_advice_cache_admin table with service role.
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "mulliganAdviceAdmin:v1:";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
const TTL_HOURS = 24;

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/** Normalize deck for cache key: sort by name, format as count|name */
function normalizeDeck(cards: { name: string; count: number }[]): string {
  const sorted = [...cards].sort((a, b) =>
    a.name.toLowerCase().trim().localeCompare(b.name.toLowerCase().trim())
  );
  return sorted.map((c) => `${c.count}|${c.name.toLowerCase().trim()}`).join(";");
}

/** Normalize hand for cache key: lowercase, trim, sort */
function normalizeHand(hand: string[]): string {
  return hand
    .map((c) => c.toLowerCase().trim())
    .sort()
    .join(",");
}

export function buildMulliganAdviceCacheKey(
  deck: { cards: { name: string; count: number }[] },
  hand: string[],
  playDraw: string,
  mulliganCount: number,
  modelTier: string,
  format: string = "commander"
): string {
  const deckNorm = normalizeDeck(deck.cards);
  const handNorm = normalizeHand(hand);
  const deckHash = hash(deckNorm);
  const handHash = hash(handNorm);
  return `${PREFIX}${deckHash}:${handHash}:${playDraw}:${mulliganCount}:${modelTier}:${format}`;
}

export type CachedAdvice = {
  response_json: unknown;
  model_used: string | null;
};

function getSupabaseAdmin() {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function getMulliganAdviceCache(
  cacheKey: string
): Promise<CachedAdvice | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("mulligan_advice_cache_admin")
    .select("response_json, model_used")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return {
    response_json: data.response_json,
    model_used: data.model_used,
  };
}

export async function setMulliganAdviceCache(
  cacheKey: string,
  responseJson: unknown,
  modelUsed: string | null
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);

  await supabase.from("mulligan_advice_cache_admin").upsert(
    {
      cache_key: cacheKey,
      response_json: responseJson,
      model_used: modelUsed,
      expires_at: expiresAt.toISOString(),
      hit_count: 0,
    },
    { onConflict: "cache_key" }
  );
}

export const CACHE_TTL_SECONDS = TTL_HOURS * 60 * 60;
