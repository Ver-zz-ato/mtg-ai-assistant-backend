import { NextRequest, NextResponse } from "next/server";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

const BASIC_LANDS = new Set(["forest", "island", "plains", "swamp", "mountain"]);
const MAX_NAMES_PER_DECK = 15;
const MAX_DECKS = 50;
const MAX_TOTAL_NAMES = 200;

function extractNamesFromDeckText(deckText: string): string[] {
  // Normalize escaped newlines (deck_text sometimes stored with \n as literal)
  let text = String(deckText || "").replace(/\\n/g, "\n").replace(/\\\\n/g, "\n");
  const parsed = parseDeckText(text);
  const nonBasic = parsed.filter((e) => !BASIC_LANDS.has(e.name.toLowerCase().trim()));
  const basic = parsed.filter((e) => BASIC_LANDS.has(e.name.toLowerCase().trim()));
  const byQty = [...nonBasic, ...basic]
    .sort((a, b) => (b.qty || 0) - (a.qty || 0))
    .slice(0, MAX_NAMES_PER_DECK)
    .map((e) => e.name.trim())
    .filter(Boolean);
  return [...new Set(byQty)];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deckIds = [], deckTexts = {}, commanders = {} } = body as {
      deckIds?: string[];
      deckTexts?: Record<string, string>;
      commanders?: Record<string, string>;
    };

    if (!Array.isArray(deckIds) || deckIds.length === 0) {
      return NextResponse.json({ ok: false, error: "deckIds array required" }, { status: 400 });
    }

    const ids = deckIds.slice(0, MAX_DECKS);
    const deckToNames: Record<string, string[]> = {};
    const allNames: string[] = [];

    const cmdMap = commanders as Record<string, string>;
    for (const deckId of ids) {
      const text = deckTexts?.[deckId];
      let names = text ? extractNamesFromDeckText(text) : [];
      // Fallback: use commander when deck_text is empty or yields no cards
      if (names.length === 0) {
        const cmd = cmdMap?.[deckId];
        if (cmd && typeof cmd === "string" && cmd.trim()) {
          names = [cmd.trim().replace(/\s*\(.*?\)\s*$/, "").trim()];
        }
      }
      // Prioritize commander so each deck gets unique art (not Sol Ring for everyone)
      const cmd = cmdMap?.[deckId];
      const cmdName = cmd && typeof cmd === "string" ? cmd.trim().replace(/\s*\(.*?\)\s*$/, "").trim() : "";
      if (cmdName && names.length > 0) {
        const rest = names.filter((n) => n.toLowerCase().trim() !== cmdName.toLowerCase());
        names = [cmdName, ...rest];
      } else if (cmdName && names.length === 0) {
        names = [cmdName];
      }
      if (names.length > 0) {
        deckToNames[deckId] = names;
        for (const n of names) {
          if (!allNames.includes(n)) allNames.push(n);
        }
      }
    }

    // Fallback: fetch from deck_cards for decks still missing names (e.g. decks with deck_text in odd format)
    const missingIds = ids.filter((id) => !deckToNames[id]);
    if (missingIds.length > 0) {
      const admin = getAdmin();
      if (admin) {
        const { data: cards } = await admin
          .from("deck_cards")
          .select("deck_id, name, qty")
          .in("deck_id", missingIds);
        const byDeck = new Map<string, { name: string; qty: number }[]>();
        for (const c of cards || []) {
          const list = byDeck.get(c.deck_id) || [];
          list.push({ name: (c as any).name, qty: (c as any).qty || 1 });
          byDeck.set(c.deck_id, list);
        }
        for (const [deckId, list] of byDeck) {
          if (deckToNames[deckId]) continue;
          const nonBasic = list.filter((c) => !BASIC_LANDS.has(c.name.toLowerCase().trim()));
          const basic = list.filter((c) => BASIC_LANDS.has(c.name.toLowerCase().trim()));
          let sorted = [...nonBasic, ...basic]
            .sort((a, b) => (b.qty || 0) - (a.qty || 0))
            .slice(0, MAX_NAMES_PER_DECK)
            .map((c) => c.name.trim())
            .filter(Boolean);
          sorted = [...new Set(sorted)];
          const cmd = cmdMap?.[deckId];
          const cmdName = cmd && typeof cmd === "string" ? cmd.trim().replace(/\s*\(.*?\)\s*$/, "").trim() : "";
          if (cmdName && sorted.length > 0) {
            const rest = sorted.filter((n) => n.toLowerCase() !== cmdName.toLowerCase());
            sorted = [cmdName, ...rest];
          }
          if (sorted.length > 0) {
            deckToNames[deckId] = sorted;
            for (const n of sorted) {
              if (!allNames.includes(n)) allNames.push(n);
            }
          }
        }
      }
    }

    const namesToFetch = allNames.slice(0, MAX_TOTAL_NAMES);
    if (namesToFetch.length === 0) {
      return NextResponse.json({ ok: true, art: {} });
    }

    const imageMap = await getImagesForNamesCached(namesToFetch);
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const art: Record<string, string> = {};
    for (const [deckId, names] of Object.entries(deckToNames)) {
      for (const name of names) {
        const key = norm(name);
        const info = imageMap.get(key);
        const url = info?.art_crop || info?.normal || info?.small;
        if (url) {
          art[deckId] = url;
          break;
        }
      }
    }

    return NextResponse.json({ ok: true, art });
  } catch (e: any) {
    console.error("[batch-art-for-decks]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
