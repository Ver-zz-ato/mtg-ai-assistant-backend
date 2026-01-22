export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { canonicalize } from "@/lib/cards/canonicalize";
import { convert } from "@/lib/currency/rates";
import { createClient } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";
import swapsData from "@/lib/data/budget-swaps.json";

// Very light-weight, research-aware swap suggester.
// Loads budget swaps from data file for easy maintenance and expansion.

type Suggestion = {
  from: string;
  to: string;
  price_from: number;
  price_to: number;
  price_delta: number;
  rationale: string;
  confidence: number; // 0..1
};

// Load swaps from JSON data file (converted to lowercase keys for matching)
const BUILTIN_SWAPS: Record<string, string[]> = (() => {
  const swaps: Record<string, string[]> = {};
  const data = swapsData as { swaps: Record<string, string[]> };
  for (const [key, values] of Object.entries(data.swaps || {})) {
    swaps[key.toLowerCase()] = values;
  }
  return swaps;
})();

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
  // Handle both \n and \\n (escaped newlines)
  const normalized = (text || "").replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  for (const raw of normalized.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    // Match: "1 Card Name" or "1x Card Name" or just "Card Name"
    const m = s.match(/^(\d+)?\s*[xX]?\s*(.+)$/);
    const name = m ? m[2].trim() : s.trim();
    if (!name) continue;
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
  
  // Load the deck_analysis prompt as the base, then add budget swap instructions
  let basePrompt = "You are ManaTap AI, an expert Magic: The Gathering assistant.";
  try {
    const promptVersion = await getPromptVersion("deck_analysis");
    if (promptVersion) {
      basePrompt = promptVersion.system_prompt;
    }
  } catch (e) {
    console.warn("[swap-suggestions] Failed to load prompt version:", e);
  }
  
  const system = [
    basePrompt,
    "",
    "=== BUDGET SWAP MODE ===",
    "You are suggesting budget-friendly alternatives for expensive cards in a Magic: The Gathering deck.",
    "",
    "CRITICAL RULES:",
    "1. Price Awareness: Only suggest swaps where the replacement card costs LESS than the threshold.",
    "2. Role Preservation: The replacement must fill the SAME role (ramp, removal, draw, win condition, etc.)",
    "3. Function Overlap: Cards must have similar functions (e.g., both are board wipes, both are mana rocks)",
    "4. Synergy Preservation: If the original card is part of a synergy, the replacement must maintain that synergy.",
    "   - For synergies: Name BOTH the enabler and payoff cards",
    "   - Describe the mechanical sequence: \"Card A does X; Card B responds to X by doing Y; together they achieve Z\"",
    "5. Format Legality: All suggestions must be legal in the deck's format (Commander, Modern, Standard, etc.)",
    "6. Color Identity: All suggestions must match the deck's color identity",
    "7. Power Level: Try to maintain similar power level, but prioritize budget when necessary",
    "",
    "SUGGESTION FORMAT:",
    "- Focus on cards that are functionally similar but cheaper",
    "- Prioritize recent reprints (they're often cheaper)",
    "- Consider cards that are slightly weaker but much cheaper",
    "- Avoid suggesting cards that are strictly worse unless they're significantly cheaper",
    "",
    "RESPONSE FORMAT:",
    "Respond ONLY with a JSON array of objects. Each object must have:",
    "- \"from\": The original expensive card name (exact name from decklist)",
    "- \"to\": The cheaper replacement card name (exact official name)",
    "- \"reason\": A concise 1-2 sentence explanation of why this swap works (mention role, synergy if applicable, and price benefit)",
    "",
    "Example:",
    "[{\"from\":\"Gaea's Cradle\",\"to\":\"Growing Rites of Itlimoc\",\"reason\":\"Both provide mana acceleration for creature-heavy decks. Growing Rites transforms into a land that taps for mana equal to creatures, making it a budget-friendly alternative that preserves the ramp role.\"}]",
    "",
    "IMPORTANT: Only suggest swaps you are confident about. Quality over quantity."
  ].join("\n");
  
  const input = `Currency: ${currency}\nThreshold: ${budget}\nDeck:\n${deckText}`;
  const body: any = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: input }] },
    ],
    max_output_tokens: 512,
    // Note: temperature removed - not supported by this model
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
      const key = from.toLowerCase();
      const cands = BUILTIN_SWAPS[key] || [];
      
      if (pf > budget) {
        for (const cand of cands) {
          const toCanon = canonicalize(cand).canonicalName || cand;
          const pt = await snapOrScryPrice(toCanon, currency, useSnapshot, snapshotDate, supabase);
          if (pt > 0 && pt < pf) {
            const delta = pt - pf;
            const rationale = `${toCanon} is a budget-friendly alternative to ${from}.`;
            const confidence = Math.max(0.3, Math.min(0.9, (pf - pt) / Math.max(1, pf)));
            suggestions.push({ from, to: toCanon, price_from: pf, price_to: pt, price_delta: delta, rationale, confidence });
          }
        }
      }
    }

    suggestions.sort((a, b) => (a.price_to - a.price_from) - (b.price_to - b.price_from));

    return NextResponse.json({ ok: true, currency, budget, suggestions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "swap failed" }, { status: 500 });
  }
}
