import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withLogging } from "@/lib/api/withLogging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Basic types
type Currency = "USD" | "EUR" | "GBP";

function normCur(v: any): Currency {
  const s = String(v || "USD").toUpperCase();
  return (s === "EUR" || s === "GBP") ? (s as Currency) : "USD";
}

function normalizeName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDeckText(text: string): Map<string, { name: string; qty: number }> {
  const map = new Map<string, { name: string; qty: number }>();
  if (!text) return map;
  const rx = /^(\d+)\s*[xX]?\s+(.+)$/;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const m = line.match(rx);
    const qty = m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
    const name = (m ? m[2] : line).trim();
    const key = normalizeName(name);
    const prev = map.get(key);
    if (prev) prev.qty += qty; else map.set(key, { name, qty });
  }
  return map;
}

async function loadOwnedByCollection(supabase: any, collectionId: string): Promise<Map<string, number>> {
  const tables = [
    "collection_cards", // preferred
    "collection_items",
    "collections_items",
    "user_collection_items",
    "cards_in_collection",
  ];
  const owned = new Map<string, number>();
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("name, card, card_name, qty, owned, count").eq("collection_id", collectionId);
    if (!error && Array.isArray(data)) {
      for (const r of data) {
        const nm = String(r?.name || r?.card || r?.card_name || "").trim();
        const q = Number(r?.qty ?? r?.owned ?? r?.count ?? 0) || 0;
        if (!nm) continue;
        const key = normalizeName(nm);
        owned.set(key, (owned.get(key) || 0) + Math.max(0, q));
      }
      break;
    }
  }
  return owned;
}

async function fetchNamedCard(name: string): Promise<any | null> {
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

async function fetchCheapestPrint(baseCard: any, want: Currency): Promise<{ set: string; set_name: string; collector_number: string; price: number; uri: string; prints: number; oracle_text?: string } | null> {
  if (!baseCard) return null;
  const printsUri = baseCard?.prints_search_uri;
  if (!printsUri) {
    // Fallback to current card's price
    const price = pickPrice(baseCard?.prices, want);
    return {
      set: baseCard.set,
      set_name: baseCard.set_name,
      collector_number: baseCard.collector_number,
      price,
      uri: baseCard.uri,
      prints: 1,
      oracle_text: baseCard.oracle_text || baseCard.card_faces?.[0]?.oracle_text || undefined,
    };
  }
  const r = await fetch(printsUri, { cache: "no-store" });
  if (!r.ok) {
    const price = pickPrice(baseCard?.prices, want);
    return {
      set: baseCard.set,
      set_name: baseCard.set_name,
      collector_number: baseCard.collector_number,
      price,
      uri: baseCard.uri,
      prints: 1,
      oracle_text: baseCard.oracle_text || baseCard.card_faces?.[0]?.oracle_text || undefined,
    };
  }
  const j = await r.json().catch(() => ({}));
  const cards: any[] = Array.isArray(j?.data) ? j.data : [];
  const prints = Number(j?.total_cards || cards.length || 0) || cards.length;
  let best: any | null = null;
  let bestP = Number.POSITIVE_INFINITY;
  for (const c of cards) {
    // Only consider non-foil normal prices if available
    const p = pickPrice(c?.prices, want);
    if (p > 0 && p < bestP) { bestP = p; best = c; }
  }
  if (!best) best = baseCard;
  return {
    set: best.set,
    set_name: best.set_name,
    collector_number: best.collector_number,
    price: pickPrice(best?.prices, want),
    uri: best.uri,
    prints,
    oracle_text: best.oracle_text || best.card_faces?.[0]?.oracle_text || undefined,
  };
}

function pickPrice(prices: any, cur: Currency): number {
  if (!prices) return 0;
  const usd = Number(prices.usd || 0) || 0;
  const eur = Number(prices.eur || 0) || 0;
  if (cur === "USD") return usd;
  if (cur === "EUR") return eur || (usd > 0 ? +(usd * 0.92).toFixed(2) : 0);
  // GBP derived from USD
  return usd > 0 ? +(usd * 0.78).toFixed(2) : (eur > 0 ? +(eur * (1/0.92) * 0.78).toFixed(2) : 0);
}

function roleHeuristic(name: string, oracle: string): { role: "ramp"|"draw"|"removal"|"wincon"|"other"; tier: "must_have"|"strong"|"nice_to_have" } {
  const t = oracle || "";
  const drawRe = /draw a card|scry [1-9]/i;
  const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land|signet|talisman|sol ring/i;
  const killRe = /destroy target|exile target|counter target|damage to any target/i;
  if (rampRe.test(t)) return { role: "ramp", tier: "must_have" };
  if (drawRe.test(t)) return { role: "draw", tier: "strong" };
  if (killRe.test(t)) return { role: "removal", tier: "strong" };
  if (/overrun|extra turn|infinite|win the game|combo/i.test(t)) return { role: "wincon", tier: "strong" };
  return { role: "other", tier: "nice_to_have" };
}

function riskDot(prints: number): "green"|"orange"|"red" {
  if (prints >= 9) return "green";
  if (prints >= 5) return "orange";
  return "red";
}

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const supabase = await createClient();
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user || null; // optional auth OK; RLS applies when fetching deck/collection

    const body = await req.json().catch(() => ({} as any));
    const deckId = body.deckId as string | undefined;
    const deckTextIn = body.deckText as string | undefined;
    const collectionId = body.collectionId as string | undefined;
    const useOwned = Boolean(body.useOwned);
    const currency = normCur(body.currency);
    const remainingBudget = typeof body.remainingBudget === "number" ? Math.max(0, body.remainingBudget) : undefined;

    let deckText = String(deckTextIn || "");
    if (!deckText && deckId) {
      const { data, error } = await supabase.from("decks").select("deck_text").eq("id", deckId).maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      deckText = String(data?.deck_text || "");
    }
    if (!deckText) return NextResponse.json({ ok: false, error: "missing deck" }, { status: 400 });

    const want = parseDeckText(deckText);
    const owned = useOwned && collectionId ? await loadOwnedByCollection(supabase, collectionId) : new Map<string, number>();

    const snapshot_ts = new Date().toISOString();

    const items: any[] = [];
    for (const [key, { name, qty }] of want.entries()) {
      const have = owned.get(key) || 0;
      const to_buy = Math.max(0, qty - have);
      if (to_buy <= 0) continue;

      const card = await fetchNamedCard(name);
      const cheapest = await fetchCheapestPrint(card, currency);
      const price_each = Math.max(0, Number(cheapest?.price || 0));
      if (remainingBudget != null && price_each > remainingBudget) continue;

      const { role, tier } = roleHeuristic(name, cheapest?.oracle_text || "");

      items.push({
        name,
        set: cheapest?.set || card?.set,
        set_name: cheapest?.set_name || card?.set_name,
        collector_number: cheapest?.collector_number || card?.collector_number,
        qty_want: qty,
        qty_have: have,
        qty_to_buy: to_buy,
        price_each,
        subtotal: +(price_each * to_buy).toFixed(2),
        currency,
        role,
        tier,
        risk: riskDot(cheapest?.prints || 0),
        scryfall_uri: cheapest?.uri || card?.uri || null,
      });
    }

    // sort: impact per £ (cheap+high qty prioritized) -> subtotal descending, then price_each asc
    items.sort((a, b) => (b.subtotal - a.subtotal) || (a.price_each - b.price_each));

    return NextResponse.json({ ok: true, snapshot_ts, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "shopping list failed" }, { status: 500 });
  }
});

// Convenience GET wrapper so we can open Cost-to-Finish in a new tab
export const GET = withLogging(async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const deckId = String(url.searchParams.get('deckId')||'');
    const currency = normCur(url.searchParams.get('currency'));
    if (!deckId) return NextResponse.json({ ok:false, error:'missing deckId' }, { status:400 });
    // Reuse POST logic by forging a JSON body
    const fake = new Request(req.url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ deckId, currency }) }) as unknown as NextRequest;
    return POST(fake);
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
});
