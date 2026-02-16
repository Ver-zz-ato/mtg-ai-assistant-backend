export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { canonicalize } from "@/lib/cards/canonicalize";
import { convert } from "@/lib/currency/rates";
import { createClient } from "@/lib/server-supabase";
import swapsData from "@/lib/data/budget-swaps.json";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { checkProStatus } from "@/lib/server-pro-check";
import { hashString, hashGuestToken } from "@/lib/guest-tracking";
import { GUEST_DAILY_FEATURE_LIMIT, SWAP_SUGGESTIONS_FREE, SWAP_SUGGESTIONS_PRO } from "@/lib/feature-limits";

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

async function aiSuggest(
  deckText: string, 
  currency: string, 
  budget: number,
  userId?: string | null,
  isPro?: boolean,
  anonId?: string | null
): Promise<Array<{ from: string; to: string; reason?: string }>> {
  const model = process.env.MODEL_SWAP_SUGGESTIONS || 'gpt-4o-mini';
  const system = `You are ManaTap AI, an expert Magic: The Gathering assistant suggesting budget-friendly alternatives.

CRITICAL RULES:
1. Price: Only suggest swaps where the replacement costs LESS than the threshold.
2. Role: Replacement must fill the SAME role (ramp, removal, draw, win condition, etc.)
3. Function: Cards must have similar functions (e.g., both board wipes, both mana rocks)
4. Synergy: If original is part of a synergy, replacement must maintain it. Name enabler and payoff.
5. Format & color: All suggestions must be legal and match deck's color identity.

RESPONSE FORMAT: Respond ONLY with a JSON array. Each object: "from" (original card), "to" (replacement), "reason" (1-2 sentences).
Example: [{"from":"Gaea's Cradle","to":"Growing Rites of Itlimoc","reason":"Both provide mana acceleration for creature-heavy decks."}]
Quality over quantity.`;
  
  const input = `Currency: ${currency}\nThreshold: ${budget}\nDeck:\n${deckText}`;
  
  try {
    const { callLLM } = await import('@/lib/ai/unified-llm-client');

    const response = await callLLM(
      [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: input }] },
      ],
      {
        route: '/api/deck/swap-suggestions',
        feature: 'swap_suggestions',
        model,
        fallbackModel: 'gpt-4o-mini',
        timeout: 90000,
        maxTokens: 512,
        apiType: 'responses',
        userId: userId || null,
        isPro: isPro || false,
        anonId: anonId ?? null,
      }
    );

    const text = response.text.trim();
    try {
      // Remove markdown code blocks if present
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return [];
    }
  } catch (e) {
    console.warn("[swap-suggestions] AI call failed:", e);
    return [];
  }
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckText = String(body.deckText || body.deck_text || "");
    const currency = String(body.currency || "USD").toUpperCase();
    const budget = Number(body.budget ?? 5); // suggest swaps for cards over this per-unit
    const useAI = Boolean(body.ai || (body.provider === "ai"));
    const useSnapshot = Boolean(body.useSnapshot || body.use_snapshot);
    const snapshotDate = String(body.snapshotDate || body.snapshot_date || new Date().toISOString().slice(0,10)).slice(0,10);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const isPro = await checkProStatus(user.id);
      const dailyCap = isPro ? SWAP_SUGGESTIONS_PRO : SWAP_SUGGESTIONS_FREE;
      const userKeyHash = `user:${await hashString(user.id)}`;
      const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/deck/swap-suggestions', dailyCap, 1);
      if (!rateLimit.allowed) {
        return NextResponse.json({
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          proUpsell: !isPro,
          error: isPro
            ? "You've reached your daily limit. Contact support if you need higher limits."
            : `You've used your ${SWAP_SUGGESTIONS_FREE} free Budget Swap runs today. Upgrade to Pro for more!`,
          resetAt: rateLimit.resetAt,
        }, { status: 429 });
      }
    } else {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const guestToken = cookieStore.get('guest_session_token')?.value;
      const keyHash = guestToken
        ? `guest:${await hashGuestToken(guestToken)}`
        : `ip:${await hashString((req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown')}`;
      const rateLimit = await checkDurableRateLimit(supabase, keyHash, '/api/deck/swap-suggestions', GUEST_DAILY_FEATURE_LIMIT, 1);
      if (!rateLimit.allowed) {
        return NextResponse.json({
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          proUpsell: true,
          error: `You've used your ${GUEST_DAILY_FEATURE_LIMIT} free runs today. Sign in for more!`,
          resetAt: rateLimit.resetAt,
        }, { status: 429 });
      }
    }

    const names = parseDeck(deckText);
    const suggestions: Suggestion[] = [];

    // If AI requested, try it first
    if (useAI) {
      const { data: { user } } = await supabase.auth.getUser();
      const isPro = user ? await checkProStatus(user.id) : false;
      let anonId: string | null = null;
      if (user?.id) anonId = await hashString(user.id);
      else {
        const { cookies } = await import('next/headers');
        const guestToken = (await cookies()).get('guest_session_token')?.value;
        if (guestToken) anonId = await hashGuestToken(guestToken);
      }
      const ai = await aiSuggest(deckText, currency, budget, user?.id || null, isPro, anonId);
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
