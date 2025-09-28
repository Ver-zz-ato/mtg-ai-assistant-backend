export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { canonicalize } from "@/lib/cards/canonicalize";
import { convert } from "@/lib/currency/rates";
import { createClient } from "@/lib/server-supabase";

// Very light-weight, research-aware swap suggester.
// It tries to load optional budget swap hints from the research folders via canonicalize()
// and falls back to a tiny builtin map for common pricey cards.

type Suggestion = {
  from: string;
  to: string;
  price_from: number;
  price_to: number;
  price_delta: number;
  rationale: string;
  confidence: number; // 0..1
};

const BUILTIN_SWAPS: Record<string, string[]> = {
  "cyclonic rift": ["Evacuation", "Aetherize"],
  "sol ring": ["Mind Stone", "Guardian Idol"],
  "mana crypt": ["Arcane Signet", "Thought Vessel"],
  "force of will": ["Counterspell", "Pact of Negation"],
};

async function scryPrice(name: string, currency = "USD"): Promise<number> {
  try {
    const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return 0;
    const j: any = await r.json();
    const p = j?.prices || {};
    const usd = parseFloat(p.usd || "0") || 0;
    const eur = parseFloat(p.eur || "0") || 0;
    let base = 0; let baseCur: "USD" | "EUR" = "USD";
    if (usd > 0) { base = usd; baseCur = "USD"; }
    else if (eur > 0) { base = eur; baseCur = "EUR"; }
    else { return 0; }
    return await convert(base, baseCur as any, currency as any);
  } catch { return 0; }
}

function parseDeck(text: string): string[] {
  const out: string[] = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)?\s*[xX]?\s*(.+)$/);
    const name = m ? m[2] : s;
    const { canonicalName } = canonicalize(name);
    if (canonicalName) out.push(canonicalName);
  }
  return Array.from(new Set(out));
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST deckText and optional budget to get budget swap suggestions.",
    example: {
      method: "POST",
      url: "/api/deck/swap-suggestions",
      body: { deckText: "1 Cyclonic Rift\n1 Sol Ring", budget: 5 },
    },
  });
}

async function aiSuggest(deckText: string, currency: string, budget: number): Promise<Array<{ from: string; to: string; reason?: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5";
  if (!apiKey) return [];
  const system = "You are an MTG budget coach. Given a decklist and price threshold, suggest cheaper near-equivalents. Respond ONLY with JSON array of objects: [{\"from\":\"Card A\",\"to\":\"Card B\",\"reason\":\"short reason\"}]";
  const input = `Currency: ${currency}\nThreshold: ${budget}\nDeck:\n${deckText}`;
  const body: any = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: input }] },
    ],
    max_output_tokens: 512,
    temperature: 0.7,
  };
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }).catch(() => null as any);
  if (!r) return [];
  const j: any = await r.json().catch(() => ({}));
  const text = (j?.output_text || "").trim();
  try { return JSON.parse(text); } catch { return []; }
}

async function snapOrScryPrice(name: string, currency: string, useSnapshot: boolean, snapshotDate: string, supabase: any): Promise<number> {
  const proper = canonicalize(name).canonicalName || name;
  if (useSnapshot) {
    try {
      const key = proper.toLowerCase();
      const { data } = await supabase.from('price_snapshots').select('unit').eq('snapshot_date', snapshotDate).eq('name_norm', key).eq('currency', currency).maybeSingle();
      const unit = Number((data as any)?.unit || 0);
      if (unit > 0) return unit;
    } catch {}
  }
  return await scryPrice(proper, currency);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckText = String(body.deckText || body.deck_text || "");
    const currency = String(body.currency || "USD").toUpperCase();
    const budget = Number(body.budget ?? 5); // suggest swaps for cards over this per-unit
    const useAI = Boolean(body.ai || (body.provider === "ai"));
    const useSnapshot = Boolean(body.useSnapshot || body.use_snapshot);
    const snapshotDate = String(body.snapshotDate || body.snapshot_date || new Date().toISOString().slice(0,10)).slice(0,10);

    const supabase = createClient();

    const names = parseDeck(deckText);
    const suggestions: Suggestion[] = [];

    // If AI requested and we have a key, try it first
    if (useAI) {
      const ai = await aiSuggest(deckText, currency, budget);
      for (const s of ai) {
        const from = canonicalize(s.from).canonicalName || s.from;
        const toCanon = canonicalize(s.to).canonicalName || s.to;
        if (!from || !toCanon) continue;
        const pf = await snapOrScryPrice(from, currency, useSnapshot, snapshotDate, supabase);
        const pt = await snapOrScryPrice(toCanon, currency, useSnapshot, snapshotDate, supabase);
        if (!(pf > 0 && pt > 0) || pt >= pf) continue; // must be cheaper
        const delta = pt - pf;
        const rationale = s.reason || `${toCanon} is a budget-friendly alternative to ${from}.`;
        const confidence = Math.max(0.3, Math.min(0.9, (pf - pt) / Math.max(1, pf)));
        suggestions.push({ from, to: toCanon, price_from: pf, price_to: pt, price_delta: delta, rationale, confidence });
      }
    }

    // Built-in fallbacks for common staples
    for (const from of names) {
      const pf = await snapOrScryPrice(from, currency, useSnapshot, snapshotDate, supabase);
      if (pf <= budget) continue;
      const key = from.toLowerCase();
      const cands = BUILTIN_SWAPS[key] || [];
      for (const cand of cands) {
        const toCanon = canonicalize(cand).canonicalName || cand;
        const pt = await snapOrScryPrice(toCanon, currency, useSnapshot, snapshotDate, supabase);
        if (pt <= 0 || pt >= pf) continue;
        const delta = pt - pf;
        const rationale = `${toCanon} is a budget-friendly alternative to ${from}.`;
        const confidence = Math.max(0.3, Math.min(0.9, (pf - pt) / Math.max(1, pf)));
        suggestions.push({ from, to: toCanon, price_from: pf, price_to: pt, price_delta: delta, rationale, confidence });
      }
    }

    suggestions.sort((a, b) => (a.price_to - a.price_from) - (b.price_to - b.price_from));

    return NextResponse.json({ ok: true, currency, budget, suggestions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "swap failed" }, { status: 500 });
  }
}
