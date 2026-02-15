import { NextRequest, NextResponse } from "next/server";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { parseDeckText } from "@/lib/deck/parseDeckText";

export const runtime = "nodejs";

const BASIC_LANDS = new Set(["forest", "island", "plains", "swamp", "mountain"]);
const MAX_NAMES_PER_DECK = 15;
const MAX_DECKS = 50;
const MAX_TOTAL_NAMES = 200;

function extractNamesFromDeckText(deckText: string): string[] {
  const parsed = parseDeckText(deckText);
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

    for (const deckId of ids) {
      const text = deckTexts?.[deckId];
      let names = text ? extractNamesFromDeckText(text) : [];
      // Fallback: use commander when deck_text is empty or yields no cards
      if (names.length === 0) {
        const cmd = (commanders as Record<string, string>)?.[deckId];
        if (cmd && typeof cmd === "string" && cmd.trim()) {
          names = [cmd.trim().replace(/\s*\(.*?\)\s*$/, "").trim()];
        }
      }
      if (names.length > 0) {
        deckToNames[deckId] = names;
        for (const n of names) {
          if (!allNames.includes(n)) allNames.push(n);
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
