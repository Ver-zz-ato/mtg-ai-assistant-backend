/**
 * 3-layer system prompt composition: BASE + FORMAT + MODULES only.
 * No decklist injection; deck context is injected separately by the chat route.
 * Uses service-role client for prompt_layers when available (required after RLS + REVOKE on anon/authenticated).
 */

import { getServerSupabase } from "@/lib/server-supabase";
import { detectModules } from "./moduleDetection";
import { getDetailsForNamesCacheOnly } from "@/lib/server/scryfallCache";

async function getDbForLayers(supabase?: any) {
  try {
    const { getAdmin } = await import("@/lib/supa");
    return getAdmin();
  } catch {
    return supabase ?? (await getServerSupabase());
  }
}

export type DeckContextForCompose = {
  deckCards: { name: string; count?: number }[];
  commanderName?: string | null;
  colorIdentity?: string[] | null;
  deckId?: string;
};

const FORMAT_KEYS = ["commander", "standard", "modern", "pioneer", "pauper"] as const;
type FormatKey = (typeof FORMAT_KEYS)[number];

function normalizeFormatKey(formatKey: string): FormatKey {
  const lower = (formatKey || "commander").toLowerCase();
  if (FORMAT_KEYS.includes(lower as FormatKey)) return lower as FormatKey;
  return "commander";
}

export type ComposeResult = {
  composed: string;
  modulesAttached: string[];
};

/**
 * Compose system prompt from layers: BASE + FORMAT_* + relevant MODULE_*.
 * Does NOT inject decklist/commander/colorIdentity; the chat route adds a separate DECK CONTEXT block.
 */
export async function composeSystemPrompt(options: {
  formatKey: string;
  deckContext?: DeckContextForCompose | null;
  supabase?: any;
}): Promise<ComposeResult> {
  const { formatKey, deckContext, supabase: passedSupabase } = options;
  const db = await getDbForLayers(passedSupabase);
  const fmt = normalizeFormatKey(formatKey);
  const formatLayerKey = `FORMAT_${fmt.toUpperCase()}` as const;

  const parts: string[] = [];
  const modulesAttached: string[] = [];

  // 1) BASE
  const { data: baseRow } = await db
    .from("prompt_layers")
    .select("body")
    .eq("key", "BASE_UNIVERSAL_ENFORCEMENT")
    .maybeSingle();
  if (baseRow?.body) parts.push(baseRow.body);
  else parts.push("You are ManaTap AI, an expert Magic: The Gathering deck analysis assistant. When referencing cards, wrap names in [[Double Brackets]].");

  // 2) FORMAT layer
  const { data: formatRow } = await db
    .from("prompt_layers")
    .select("body")
    .eq("key", formatLayerKey)
    .maybeSingle();
  if (formatRow?.body) parts.push("\n\n" + formatRow.body);

  // 3) MODULE layers (only if deckContext and we have cached card data for detection).
  // Empty deckCards is intentional: return BASE + FORMAT only (no modules); do not throw.
  if (deckContext?.deckCards?.length) {
    const names = Array.from(new Set(deckContext.deckCards.map((c) => c.name))).slice(0, 200);
    const cached = await getDetailsForNamesCacheOnly(names);
    const normMap = new Map<string, { type_line?: string; oracle_text?: string }>();
    cached.forEach((v, k) => normMap.set(k, v));
    const { modulesAttached: attached } = detectModules(
      deckContext.deckCards,
      normMap,
      deckContext.commanderName ?? undefined
    );
    for (const key of attached) {
      const { data: modRow } = await db.from("prompt_layers").select("body").eq("key", key).maybeSingle();
      if (modRow?.body) {
        parts.push("\n\n" + modRow.body);
        modulesAttached.push(key);
      }
    }
  }

  const composed = parts.join("");
  return { composed, modulesAttached };
}
