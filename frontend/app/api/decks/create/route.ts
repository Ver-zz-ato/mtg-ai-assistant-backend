import { NextRequest } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
import { z } from "zod";
import { withLogging } from "@/lib/api/withLogging";

import { containsProfanity, sanitizeName } from "@/lib/profanity";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Check if a card can be a commander by querying cache/Scryfall
 * Returns { isCommander, colorIdentity }
 */
async function checkIfCommanderWithColors(cardName: string): Promise<{ isCommander: boolean; colorIdentity: string[] }> {
  try {
    const details = await getDetailsForNamesCached([cardName]);
    const card = details.get(norm(cardName));
    
    if (!card) return { isCommander: false, colorIdentity: [] };
    
    const typeLine = (card.type_line || '').toLowerCase();
    const oracleText = (card.oracle_text || '').toLowerCase();
    const colorIdentity = Array.isArray(card.color_identity) ? card.color_identity.map((c: string) => c.toUpperCase()) : [];
    
    // Check if it's a legendary creature or planeswalker
    if (typeLine.includes('legendary creature')) return { isCommander: true, colorIdentity };
    if (typeLine.includes('legendary planeswalker') && oracleText.includes('can be your commander')) return { isCommander: true, colorIdentity };
    
    // Check for special commander abilities (Partner, etc.)
    if (oracleText.includes('can be your commander')) return { isCommander: true, colorIdentity };
    
    return { isCommander: false, colorIdentity };
  } catch {
    return { isCommander: false, colorIdentity: [] };
  }
}

/**
 * Fetch color identity for a commander (handles partner commanders with //)
 */
async function getCommanderColorIdentity(commanderName: string): Promise<string[]> {
  if (!commanderName?.trim()) return [];
  
  const parts = commanderName.split(/\s*\/\/\s*/);
  const allColors = new Set<string>();
  
  try {
    const details = await getDetailsForNamesCached(parts);
    
    for (const part of parts) {
      const cardData = details.get(norm(part));
      if (cardData?.color_identity && Array.isArray(cardData.color_identity)) {
        cardData.color_identity.forEach((c: string) => allColors.add(c.toUpperCase()));
      }
    }
    
    const wubrgOrder = ['W', 'U', 'B', 'R', 'G'];
    return wubrgOrder.filter(c => allColors.has(c));
  } catch {
    return [];
  }
}

const Req = z.object({
  title: z.string().min(1).max(120),
  format: z.string().default("Commander"),
  plan: z.string().default("Optimized"),
  colors: z.array(z.string()).default([]),
  currency: z.string().default("USD"),
  deck_text: z.string().default(""),
  data: z.any().optional(),
});

function parseDeckText(text: string): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // e.g. "1 Sol Ring", "2x Arcane Signet"
    const m = line.match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
    if (!m) continue;
    const qty = Math.max(0, parseInt(m[1], 10) || 0);
    const name = m[2].trim();
    if (!qty || !name) continue;
    out.push({ name, qty });
  }
  return out;
}

function aggregateCards(cards: Array<{ name: string; qty: number }>): Array<{ name: string; qty: number }> {
  const map = new Map<string, { name: string; qty: number }>();
  for (const c of cards) {
    const key = c.name.trim().toLowerCase();
    const prev = map.get(key);
    if (prev) prev.qty += c.qty;
    else map.set(key, { name: c.name.trim(), qty: c.qty });
  }
  return Array.from(map.values());
}

async function _POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userResp } = await supabase.auth.getUser();
    const user = userResp?.user;
    if (!user) return err("unauthorized", "unauthorized", 401);

    const raw = await req.json().catch(() => ({} as any));
    // Normalize deckText -> deck_text if caller used camelCase
    if (typeof raw?.deckText === 'string' && !raw?.deck_text) raw.deck_text = raw.deckText;
    const parsed = Req.safeParse(raw);
    if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
    const payload = parsed.data;

    // Profanity guard on deck titles (same policy as rename endpoint)
    const cleanTitle = sanitizeName(payload.title, 120);
    if (containsProfanity(cleanTitle)) return err("Please choose a different deck name.", "bad_request", 400);

    // Extract commander from deck_text (first valid commander for Commander format)
    let commander: string | null = null;
    let colors: string[] = payload.colors || [];
    
    if (payload.format === "Commander" && payload.deck_text) {
      const allCards = parseDeckText(payload.deck_text);
      // Check each card until we find a valid commander
      for (const card of allCards.slice(0, 10)) { // Check first 10 cards
        const result = await checkIfCommanderWithColors(card.name);
        if (result.isCommander) {
          commander = card.name;
          // Only use detected colors if none were provided
          if (colors.length === 0 && result.colorIdentity.length > 0) {
            colors = result.colorIdentity;
          }
          break;
        }
      }
      // Fallback: if no valid commander found, use first card anyway
      if (!commander && allCards.length > 0) {
        commander = allCards[0].name;
        // Try to get colors for the fallback commander
        if (colors.length === 0) {
          colors = await getCommanderColorIdentity(commander);
        }
      }
    }

    const t0 = Date.now();
    const { data, error } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title: cleanTitle || "Untitled Deck",
        format: payload.format,
        plan: payload.plan,
        colors: colors.length > 0 ? colors : null,
        currency: payload.currency,
        deck_text: payload.deck_text,
        commander: commander,
        data: payload.data ?? null,
        is_public: false,
      })
      .select("id")
      .single();

    if (error) return err(error.message, "db_error", 500);

    // Parse & upsert deck_cards
    const cardsRaw = parseDeckText(payload.deck_text || "");
    const cards = aggregateCards(cardsRaw);
    if (cards.length) {
      const rows = cards.map((c) => ({ deck_id: data.id as string, name: c.name, qty: c.qty }));
      const { error: dcErr } = await supabase
        .from("deck_cards")
        .upsert(rows, { onConflict: "deck_id,name" });
      if (dcErr) {
        return ok({ id: data.id, warning: `created deck but failed upserting ${rows.length} cards: ${dcErr.message}` });
      }
    }

    try { 
      const { captureServer } = await import("@/lib/server/analytics");
      // Extract prompt_version from analysis data if present
      const promptVersion = (payload.data as any)?.analyze?.prompt_version || (payload.data as any)?.analyze?.prompt_version_id || null;
      await captureServer("deck_saved", { 
        deck_id: data.id, 
        inserted: cards.length || 0, 
        user_id: user.id, 
        ms: Date.now() - t0,
        format: payload.format || null,
        commander: commander || null,
        prompt_version: promptVersion
      }); 
    } catch {}
    
    // Log activity for live presence banner
    try {
      const deckTitle = cleanTitle || "Untitled Deck";
      await fetch('/api/stats/activity/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'deck_uploaded',
          message: `New deck uploaded: ${deckTitle}`,
        }),
      });
    } catch {}
    
    return ok({ id: data.id, inserted: cards.length || 0 });
  } catch (e: any) {
    return err(e?.message || "server_error", "internal", 500);
  }
}

export const POST = withLogging(_POST, "POST");
