import { NextRequest } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
import { z } from "zod";
import { withLogging } from "@/lib/api/withLogging";

import { containsProfanity, sanitizeName } from "@/lib/profanity";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { parseDeckText, parseDeckTextWithZones } from "@/lib/deck/parseDeckText";
import { getFormatComplianceMessage } from "@/lib/deck/formatCompliance";
import { isCommanderEligible } from "@/lib/deck/deck-enrichment";

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
    
    const colorIdentity = Array.isArray(card.color_identity) ? card.color_identity.map((c: string) => c.toUpperCase()) : [];

    const isCmd = isCommanderEligible(card.type_line, card.oracle_text);
    return { isCommander: isCmd, colorIdentity };
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
  /** Explicit opt-in; omitted or false keeps the deck private. */
  is_public: z.boolean().optional(),
  data: z.any().optional(),
});

async function _POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    let { data: userResp } = await supabase.auth.getUser();
    let user = userResp?.user;

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) return err("unauthorized", "unauthorized", 401);

    const raw = await req.json().catch(() => ({} as any));
    // Normalize deckText -> deck_text if caller used camelCase
    if (typeof raw?.deckText === 'string' && !raw?.deck_text) raw.deck_text = raw.deckText;
    const parsed = Req.safeParse(raw);
    if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
    const payload = parsed.data;

    const cleanTitle = sanitizeName(payload.title, 120);
    const makePublic = payload.is_public === true;
    if (makePublic && cleanTitle && containsProfanity(cleanTitle)) {
      return err(
        "Please remove offensive language before making this public.",
        "bad_request",
        400
      );
    }
    if (makePublic) {
      const parsedCount = parseDeckText(payload.deck_text || "");
      const cardCount = parsedCount.reduce((s, p) => s + (p.qty || 1), 0);
      const msg = getFormatComplianceMessage(payload.format, cardCount);
      if (msg) return err(msg, "bad_request", 400);
    }

    // Extract commander from deck_text (mainboard cards only; Commander format)
    let commander: string | null = null;
    let colors: string[] = payload.colors || [];
    
    if (payload.format === "Commander" && payload.deck_text) {
      const zonedForCmd = parseDeckTextWithZones(payload.deck_text);
      const mainCandidates = zonedForCmd.filter((c) => c.zone === "mainboard");
      // Check each mainboard card until we find a valid commander
      for (const card of mainCandidates.slice(0, 10)) {
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
      // Fallback: if no valid commander found, use first mainboard card anyway
      if (!commander && mainCandidates.length > 0) {
        commander = mainCandidates[0].name;
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
        colors,
        currency: payload.currency,
        deck_text: payload.deck_text,
        commander: commander,
        data: payload.data ?? null,
        is_public: makePublic,
      })
      .select("id")
      .single();

    if (error) return err(error.message, "db_error", 500);

    // Parse & upsert deck_cards — preserve mainboard vs sideboard (UNIQUE deck_id,name,zone)
    const zonedCards = parseDeckTextWithZones(payload.deck_text || "");
    let insertedCount = 0;

    if (zonedCards.length) {
      const rows = zonedCards.map((c) => ({
        deck_id: data.id as string,
        name: c.name.trim(),
        qty: c.qty,
        zone: c.zone === "sideboard" ? "sideboard" : "mainboard",
      }));
      insertedCount = rows.length;
      const { error: dcErr } = await supabase.from("deck_cards").upsert(rows, {
        onConflict: "deck_id,name,zone",
      });
      if (dcErr) {
        const msg = dcErr.message || String(dcErr);
        const schemaLikelyMissing =
          /unique constraint|violates|could not find|on conflict|42703|42P10/i.test(msg) &&
          /deck_id|name|zone/i.test(msg);
        return err(
          schemaLikelyMissing
            ? `deck_cards upsert failed — ensure migration deck_cards zone + UNIQUE(deck_id,name,zone) is applied: ${msg}`
            : `deck_cards upsert failed: ${msg}`,
          "db_error",
          500,
        );
      }
    }

    try {
      const { captureServer } = await import("@/lib/server/analytics");
      const promptVersion =
        (payload.data as any)?.analyze?.prompt_version ||
        (payload.data as any)?.analyze?.prompt_version_id ||
        null;
      await captureServer("deck_saved", {
        deck_id: data.id,
        inserted: insertedCount,
        user_id: user.id,
        ms: Date.now() - t0,
        format: payload.format || null,
        commander: commander || null,
        prompt_version: promptVersion,
      });
    } catch {}

    try {
      const deckTitle = cleanTitle || "Untitled Deck";
      await fetch("/api/stats/activity/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "deck_uploaded",
          message: `New deck uploaded: ${deckTitle}`,
        }),
      });
    } catch {}

    return ok({ id: data.id, inserted: insertedCount });
  } catch (e: any) {
    return err(e?.message || "server_error", "internal", 500);
  }
}

export const POST = withLogging(_POST, "POST");
