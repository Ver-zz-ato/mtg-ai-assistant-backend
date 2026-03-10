import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backfill-commanders
 * Backfill commander and colors for Commander format decks that are missing them.
 * 
 * - Decks with commander IS NULL: infer from deck_cards or deck_text (first legendary).
 * - Decks with colors IS NULL: fetch color identity from commander (via Scryfall).
 * 
 * Run via: curl -X POST /api/admin/backfill-commanders (with auth)
 * Or schedule via cron.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Decks missing commander OR colors (Commander format only)
    const { data: decksNullCommander, error: err1 } = await supabase
      .from("decks")
      .select("id, deck_text, format, commander, colors")
      .eq("format", "Commander")
      .is("commander", null)
      .not("deck_text", "is", null);

    const { data: decksNullColors, error: err2 } = await supabase
      .from("decks")
      .select("id, deck_text, format, commander, colors")
      .eq("format", "Commander")
      .not("commander", "is", null)
      .or("colors.is.null,colors.eq.{}");

    if (err1 || err2) {
      return NextResponse.json({ ok: false, error: err1?.message || err2?.message }, { status: 500 });
    }

    const byId = new Map<string, { id: string; deck_text: string | null; commander: string | null; colors: string[] | null }>();
    for (const d of decksNullCommander || []) {
      byId.set(d.id, { id: d.id, deck_text: d.deck_text, commander: d.commander, colors: d.colors });
    }
    for (const d of decksNullColors || []) {
      const existing = byId.get(d.id);
      if (!existing) byId.set(d.id, { id: d.id, deck_text: d.deck_text, commander: d.commander, colors: d.colors });
    }
    const decks = Array.from(byId.values());

    if (decks.length === 0) {
      return NextResponse.json({ ok: true, message: "No decks to update", updated: 0 });
    }

    console.log(`[Backfill] Found ${decks.length} decks missing commander or colors`);

    let updated = 0;
    const errors: string[] = [];

    for (const deck of decks) {
      try {
        let commander: string | null = deck.commander;
        let colors: string[] | null = Array.isArray(deck.colors) && deck.colors.length > 0 ? deck.colors : null;

        // Need to infer commander from deck
        if (!commander) {
          const { data: deckCards } = await supabase
            .from("deck_cards")
            .select("name")
            .eq("deck_id", deck.id)
            .limit(100);

          let cardNames: string[] = (deckCards || []).map((c: { name: string }) => c.name).filter((n: string) => n && !looksLikeGarbage(n));

          if (cardNames.length === 0 && deck.deck_text) {
            for (const line of deck.deck_text.split(/\r?\n/).slice(0, 25)) {
              const m = line.trim().match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
              if (m) {
                const name = m[2].trim();
                if (!looksLikeGarbage(name)) cardNames.push(name);
              }
            }
          }

          for (const cardName of cardNames) {
            const res = await fetchCommanderAndColors(cardName);
            if (res.isCommander) {
              commander = cardName;
              if (res.colorIdentity.length > 0) colors = res.colorIdentity;
              break;
            }
          }
          // Do NOT fallback to first card - Sol Ring, Arcane Signet, etc. are NOT commanders
        }

        // Have commander but need colors
        if (commander && !colors) {
          const res = await fetchCommanderAndColors(commander);
          if (res.colorIdentity.length > 0) colors = res.colorIdentity;
        }

        if (!commander && !colors) continue;

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (commander) updatePayload.commander = commander;
        if (colors && colors.length > 0) updatePayload.colors = colors;

        const { error: updateError } = await supabase
          .from("decks")
          .update(updatePayload)
          .eq("id", deck.id);

        if (updateError) {
          errors.push(`${deck.id}: ${updateError.message}`);
        } else {
          updated++;
          console.log(`[Backfill] ${deck.id}: commander=${commander || deck.commander}, colors=${colors?.join("") || "—"}`);
        }
      } catch (err: any) {
        errors.push(`${deck.id}: ${err?.message || String(err)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Backfill complete",
      totalDecks: decks.length,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

function looksLikeGarbage(name: string): boolean {
  const n = (name || "").trim();
  if (n.length > 120) return true;
  if (/\[MB\]|\[%\]|\[°C\]|\[V\]|\[W\]|\[MHz\]|\[RPM\]|Temperature|Virtual Memory|GPU Core|Date,Time/i.test(n)) return true;
  if (/,{2,}/.test(n) || n.split(",").length > 3) return true;
  return false;
}

/** Fetch card from Scryfall; return isCommander and color identity. For partner (A // B), fetches both parts and merges colors. */
async function fetchCommanderAndColors(cardName: string): Promise<{ isCommander: boolean; colorIdentity: string[] }> {
  const parts = cardName.split(/\s*\/\/\s*/).map((p) => p.trim()).filter(Boolean);
  const allColors = new Set<string>();
  let isCommander = false;

  for (const part of parts) {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(part)}`);
      if (!res.ok) continue;
      const card = await res.json();
      const typeLine = (card.type_line || "").toLowerCase();
      const oracleText = (card.oracle_text || "").toLowerCase();
      const ci = Array.isArray(card.color_identity) ? card.color_identity : [];
      ci.forEach((c: string) => allColors.add(c.toUpperCase()));
      isCommander =
        isCommander ||
        typeLine.includes("legendary creature") ||
        (typeLine.includes("legendary planeswalker") && oracleText.includes("can be your commander")) ||
        oracleText.includes("can be your commander");
    } catch {
      /* skip */
    }
  }

  const wubrg = ["W", "U", "B", "R", "G"];
  return { isCommander, colorIdentity: wubrg.filter((c) => allColors.has(c)) };
}

