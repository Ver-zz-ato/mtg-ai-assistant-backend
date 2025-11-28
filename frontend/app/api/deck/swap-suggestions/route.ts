export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { canonicalize } from "@/lib/cards/canonicalize";
import { convert } from "@/lib/currency/rates";
import { createClient } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";

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
  // Expensive ramp
  "gaea's cradle": ["Growing Rites of Itlimoc", "Nykthos, Shrine to Nyx", "Circle of Dreams Druid"],
  "mana crypt": ["Arcane Signet", "Thought Vessel", "Sol Ring"],
  "chrome mox": ["Mox Amber", "Fellwar Stone", "Arcane Signet"],
  "mox diamond": ["Lotus Petal", "Arcane Signet", "Chrome Mox"],
  "ancient tomb": ["Temple of the False God", "Nykthos, Shrine to Nyx"],
  "city of traitors": ["Ancient Tomb", "Temple of the False God"],
  
  // Expensive tutors
  "imperial seal": ["Vampiric Tutor", "Demonic Tutor", "Grim Tutor"],
  "vampiric tutor": ["Demonic Tutor", "Diabolic Intent", "Grim Tutor"],
  "demonic tutor": ["Diabolic Tutor", "Diabolic Intent", "Beseech the Queen"],
  "enlightened tutor": ["Idyllic Tutor", "Academy Rector", "Three Dreams"],
  "mystical tutor": ["Merchant Scroll", "Personal Tutor", "Mystical Teachings"],
  
  // Expensive counterspells
  "force of will": ["Force of Negation", "Pact of Negation", "Fierce Guardianship"],
  "force of negation": ["Pact of Negation", "Counterspell", "Arcane Denial"],
  "mana drain": ["Counterspell", "Arcane Denial", "Swan Song"],
  "fierce guardianship": ["Counterspell", "Negate", "Arcane Denial"],
  "pact of negation": ["Counterspell", "Force of Negation", "Mana Leak"],
  
  // Expensive removal/board wipes
  "cyclonic rift": ["Evacuation", "Aetherize", "Engulf the Shore"],
  "toxic deluge": ["Black Sun's Zenith", "Damnation", "Languish"],
  "force of vigor": ["Nature's Claim", "Beast Within", "Krosan Grip"],
  "deflecting swat": ["Bolt Bend", "Ricochet Trap", "Wild Ricochet"],
  
  // Expensive card draw
  "rhystic study": ["Mystic Remora", "Phyrexian Arena", "Trouble in Pairs"],
  "smothering tithe": ["Monologue Tax", "Approach of the Second Sun", "Bident of Thassa"],
  "mystic remora": ["Rhystic Study", "Phyrexian Arena", "Curiosity"],
  "necropotence": ["Phyrexian Arena", "Dark Tutelage", "Dark Confidant"],
  
  // Expensive creatures
  "craterhoof behemoth": ["End-Raze Forerunners", "Decimator of the Provinces", "Pathbreaker Ibex"],
  "dockside extortionist": ["Treasure Nabber", "Dire Fleet Daredevil", "Professional Face-Breaker"],
  "gilded drake": ["Control Magic", "Sower of Temptation", "Agent of Treachery"],
  "opposition agent": ["Aven Mindcensor", "Leonin Arbiter", "Notion Thief"],
  
  // Expensive lands
  "lion's eye diamond": ["Lotus Petal", "Chromatic Star", "Chromatic Sphere"],
  "fetchlands": ["Evolving Wilds", "Terramorphic Expanse", "Fabled Passage"],
  "underground sea": ["Drowned Catacomb", "Sunken Hollow", "Choked Estuary"],
  "volcanic island": ["Sulfur Falls", "Steam Vents", "Cascade Bluffs"],
  "tropical island": ["Hinterland Harbor", "Breeding Pool", "Flooded Grove"],
  "tundra": ["Glacial Fortress", "Hallowed Fountain", "Mystic Gate"],
  "taiga": ["Rootbound Crag", "Stomping Ground", "Fire-Lit Thicket"],
  "savannah": ["Sunpetal Grove", "Temple Garden", "Wooded Bastion"],
  "scrubland": ["Isolated Chapel", "Godless Shrine", "Fetid Heath"],
  "badlands": ["Dragonskull Summit", "Blood Crypt", "Graven Cairns"],
  "bayou": ["Woodland Cemetery", "Overgrown Tomb", "Twilight Mire"],
  "plateau": ["Clifftop Retreat", "Sacred Foundry", "Rugged Prairie"],
  
  // Specific Commander staples
  "sylvan library": ["Abundance", "Mirri's Guile", "Sensei's Divining Top"],
  "scroll rack": ["Sensei's Divining Top", "Crystal Ball", "Soothsaying"],
  "mana vault": ["Sol Ring", "Arcane Signet", "Thought Vessel"],
  "timetwister": ["Time Reversal", "Windfall", "Wheel of Fortune"],
  "wheel of fortune": ["Reforge the Soul", "Magus of the Wheel", "Wheel of Misfortune"],
  "survival of the fittest": ["Fauna Shaman", "Survival", "Birthing Pod"],
  "the tabernacle at pendrell vale": ["Magus of the Tabernacle", "Sphere of Resistance"],
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
    "Given a decklist and price threshold, suggest cheaper near-equivalents that preserve deck function.",
    "Focus on role/function overlap and synergy preservation.",
    "Respond ONLY with JSON array of objects: [{\"from\":\"Card A\",\"to\":\"Card B\",\"reason\":\"short reason\"}]"
  ].join("\n");
  
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
