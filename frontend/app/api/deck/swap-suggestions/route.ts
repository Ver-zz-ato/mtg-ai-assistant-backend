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
  anonId?: string | null,
  commander?: string | null,
  allowedColors?: string[] | null
): Promise<Array<{ from: string; to: string; reason?: string }>> {
  const model = process.env.MODEL_SWAP_SUGGESTIONS || 'gpt-4o-mini';
  
  // Build color identity instruction if available
  let colorIdentityRule = '5. Format & color: All suggestions must be legal and match deck\'s color identity.';
  if (commander && allowedColors && allowedColors.length > 0) {
    const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const colorNamesStr = allowedColors.map(c => colorNames[c] || c).join(', ');
    colorIdentityRule = `5. **COLOR IDENTITY (CRITICAL)**: Commander is ${commander} with color identity ${allowedColors.join('')} (${colorNamesStr}). You MUST ONLY suggest replacement cards within this color identity. Do NOT suggest any cards with mana symbols outside of ${allowedColors.join(', ')}. This is non-negotiable.`;
  }
  
  const system = `You are ManaTap AI, an expert Magic: The Gathering assistant suggesting budget-friendly alternatives.

CRITICAL RULES:
1. Price: Only suggest swaps where the replacement costs LESS than the threshold.
2. Role: Replacement MUST fill the SAME deck role:
   - Ramp → Ramp only (mana rocks, land fetch, dorks)
   - Removal → Removal only (destroy, exile, bounce, counter)
   - Card draw → Card draw only (draw spells, cantrips, card selection)
   - Win condition → Win condition only (finishers, combo pieces)
   - Protection → Protection only (hexproof, indestructible, phasing)
   NEVER swap between categories (e.g., don't replace removal with ramp)
3. CMC Match: Try to match mana cost within 1-2 CMC when possible
4. Synergy Protection: NEVER suggest swapping:
   - Known combo pieces (Thassa's Oracle, Thoracle, Demonic Consultation, etc.)
   - Cards that reference specific other cards by name
   - Cards with "you win the game" or infinite combo potential
${colorIdentityRule}

RESPONSE FORMAT: Respond ONLY with a JSON array. Each object: "from" (original card), "to" (replacement), "reason" (1-2 sentences explaining role match).
Example: [{"from":"Gaea's Cradle","to":"Growing Rites of Itlimoc","reason":"Both are lands that tap for mana based on creatures - same ramp role."}]
Quality over quantity. If no good swaps exist, return empty array [].`;
  
  const input = `Currency: ${currency}\nThreshold: ${budget}${commander ? `\nCommander: ${commander}` : ''}\nDeck:\n${deckText}`;
  
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
    const commander = String(body.commander || "").trim();
    const format = String(body.format || "Commander").trim();

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

    // Detect combo pieces - these should NOT be suggested for swapping
    let comboPieces = new Set<string>();
    try {
      const { detectCombos, normalizeDeckNames } = await import('@/lib/combos/detect');
      const normalizedNames = normalizeDeckNames(deckText);
      const { present } = detectCombos(normalizedNames);
      
      // Collect all pieces from detected combos
      for (const combo of present) {
        for (const piece of combo.pieces) {
          comboPieces.add(piece.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim());
        }
      }
      
      if (comboPieces.size > 0) {
        console.log('[swap-suggestions] Protected combo pieces:', Array.from(comboPieces).join(', '));
      }
    } catch (comboErr) {
      console.warn('[swap-suggestions] Combo detection failed:', comboErr);
    }

    // Fetch commander's color identity for validation
    let allowedColors: string[] = [];
    const isCommanderFormat = format.toLowerCase().includes('commander') || format.toLowerCase().includes('edh');
    if (isCommanderFormat && commander) {
      try {
        const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
        const commanderDetails = await getDetailsForNamesCached([commander]);
        const commanderEntry = commanderDetails.get(commander.toLowerCase()) || 
          Array.from(commanderDetails.values())[0];
        allowedColors = (commanderEntry?.color_identity || []).map((c: string) => c.toUpperCase());
        if (allowedColors.length > 0) {
          console.log('[swap-suggestions] Commander color identity:', allowedColors.join(','));
        }
      } catch (e) {
        console.warn('[swap-suggestions] Failed to fetch commander color identity:', e);
      }
    }

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
      const ai = await aiSuggest(deckText, currency, budget, user?.id || null, isPro, anonId, commander || null, allowedColors.length > 0 ? allowedColors : null);
      for (const s of ai) {
        const from = canonicalize(s.from).canonicalName || s.from;
        const toCanon = canonicalize(s.to).canonicalName || s.to;
        if (!from || !toCanon) continue;
        
        // Skip combo pieces - don't suggest swapping them
        const fromNorm = from.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
        if (comboPieces.has(fromNorm)) {
          console.log(`[swap-suggestions] Skipping combo piece: ${from}`);
          continue;
        }
        
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
      // Skip combo pieces - don't suggest swapping them
      const fromNorm = from.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
      if (comboPieces.has(fromNorm)) {
        console.log(`[swap-suggestions] Skipping combo piece (builtin): ${from}`);
        continue;
      }
      
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

    // COLOR IDENTITY VALIDATION: Filter out off-color swaps for Commander format
    let validatedSuggestions = suggestions;
    
    if (isCommanderFormat && commander && suggestions.length > 0 && allowedColors.length > 0) {
      try {
        const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
        const { isWithinColorIdentity } = await import('@/lib/deck/mtgValidators');
        
        console.log('[swap-suggestions] Validating color identity:', allowedColors.join(','));
        
        // Fetch color identity for all "to" cards
        const toCardNames = suggestions.map(s => s.to);
        const cardDetails = await getDetailsForNamesCached(toCardNames);
        
        // Filter out off-color suggestions
        const beforeCount = suggestions.length;
        validatedSuggestions = suggestions.filter(s => {
          const cardKey = s.to.toLowerCase();
          const cardEntry = cardDetails.get(cardKey) || 
            Array.from(cardDetails.entries()).find(([k]) => k.toLowerCase() === cardKey)?.[1];
          
          if (!cardEntry) {
            // Card not found in cache - keep it (might be valid)
            return true;
          }
          
          const cardColors = cardEntry.color_identity || [];
          const isValid = isWithinColorIdentity({ color_identity: cardColors } as any, allowedColors);
          
          if (!isValid) {
            console.log(`[swap-suggestions] Filtered off-color swap: ${s.to} (${cardColors.join(',')}) not in ${allowedColors.join(',')}`);
          }
          
          return isValid;
        });
        
        const removedCount = beforeCount - validatedSuggestions.length;
        if (removedCount > 0) {
          console.log(`[swap-suggestions] Removed ${removedCount} off-color suggestions`);
        }
      } catch (colorErr) {
        console.error('[swap-suggestions] Color identity validation error:', colorErr);
        // Continue with unfiltered suggestions on error
      }
    }

    return NextResponse.json({ ok: true, currency, budget, suggestions: validatedSuggestions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "swap failed" }, { status: 500 });
  }
}
