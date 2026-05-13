import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

type SupabaseLike = {
  from: (table: string) => any;
};

export type OwnershipContext = {
  hasCollection: boolean;
  ownedCount: number;
  ownedDeckQty: number;
  deckQty: number;
  missingQty: number;
  ownedPct: number;
  ownedNotInDeckSample: string[];
  missingDeckSample: string[];
};

function qtyOf(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function addQty(map: Map<string, { name: string; qty: number }>, name: string, qty: number) {
  const trimmed = String(name || "").trim();
  if (!trimmed || qty <= 0) return;
  const key = normalizeScryfallCacheName(trimmed);
  const prev = map.get(key);
  map.set(key, { name: prev?.name || trimmed, qty: (prev?.qty ?? 0) + qty });
}

export async function buildOwnershipContextForUserDeck(params: {
  supabase: SupabaseLike;
  userId: string | null | undefined;
  deckCards: Array<{ name?: string | null; qty?: number | null }> | null | undefined;
  sampleLimit?: number;
}): Promise<OwnershipContext | null> {
  const userId = params.userId?.trim();
  if (!userId) return null;

  const sampleLimit = Math.max(4, Math.min(24, params.sampleLimit ?? 16));
  const deckMap = new Map<string, { name: string; qty: number }>();
  for (const card of params.deckCards ?? []) {
    addQty(deckMap, String(card?.name ?? ""), qtyOf(card?.qty ?? 1) || 1);
  }
  if (deckMap.size === 0) return null;

  const { data: collections, error: collectionsErr } = await params.supabase
    .from("collections")
    .select("id")
    .eq("user_id", userId);
  if (collectionsErr || !collections?.length) return null;

  const ids = collections.map((c: { id?: string }) => c.id).filter(Boolean);
  if (!ids.length) return null;

  const ownedMap = new Map<string, { name: string; qty: number }>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await params.supabase
      .from("collection_cards")
      .select("name, qty")
      .in("collection_id", ids)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return null;
    const batch = (data ?? []) as Array<{ name?: string | null; qty?: number | null }>;
    for (const row of batch) addQty(ownedMap, String(row.name ?? ""), qtyOf(row.qty));
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  if (ownedMap.size === 0) {
    return {
      hasCollection: false,
      ownedCount: 0,
      ownedDeckQty: 0,
      deckQty: Array.from(deckMap.values()).reduce((s, x) => s + x.qty, 0),
      missingQty: Array.from(deckMap.values()).reduce((s, x) => s + x.qty, 0),
      ownedPct: 0,
      ownedNotInDeckSample: [],
      missingDeckSample: [],
    };
  }

  let deckQty = 0;
  let ownedDeckQty = 0;
  const missingDeckSample: string[] = [];
  for (const [key, card] of deckMap) {
    deckQty += card.qty;
    const owned = Math.min(card.qty, ownedMap.get(key)?.qty ?? 0);
    ownedDeckQty += owned;
    if (owned < card.qty && missingDeckSample.length < sampleLimit) missingDeckSample.push(card.name);
  }

  const ownedNotInDeckSample: string[] = [];
  for (const [key, card] of ownedMap) {
    if (deckMap.has(key)) continue;
    ownedNotInDeckSample.push(card.name);
    if (ownedNotInDeckSample.length >= sampleLimit) break;
  }

  const missingQty = Math.max(0, deckQty - ownedDeckQty);
  return {
    hasCollection: true,
    ownedCount: ownedMap.size,
    ownedDeckQty,
    deckQty,
    missingQty,
    ownedPct: deckQty > 0 ? Math.round((ownedDeckQty / deckQty) * 100) : 0,
    ownedNotInDeckSample,
    missingDeckSample,
  };
}

export function formatOwnershipContextForPrompt(context: OwnershipContext | null): string {
  if (!context || !context.hasCollection) return "";
  const lines = [
    "USER COLLECTION CONTEXT:",
    `- Deck ownership: ${context.ownedDeckQty}/${context.deckQty} cards owned (${context.ownedPct}%).`,
    `- Missing from collection: ${context.missingQty} card copies.`,
  ];
  if (context.missingDeckSample.length) {
    lines.push(`- Missing deck cards sample: ${context.missingDeckSample.join(", ")}.`);
  }
  if (context.ownedNotInDeckSample.length) {
    lines.push(`- Owned cards not currently in deck sample: ${context.ownedNotInDeckSample.join(", ")}.`);
    lines.push("- Prefer owned cards as replacements/upgrades when they are a close strategic fit. Label them as Owned.");
  }
  return lines.join("\n");
}
