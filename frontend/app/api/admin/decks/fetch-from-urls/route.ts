/**
 * Admin: fetch decks from Moxfield/Archidekt URLs and import as public decks.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";
import { containsProfanity } from "@/lib/profanity";

const PUBLIC_DECKS_USER_ID = "b8c7d6e5-f4a3-4210-9d00-000000000001";
const MAX_URLS = 50;

function extractDeckId(url: string): { source: "moxfield" | "archidekt"; id: string } | null {
  const u = url.trim();
  const mox = u.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  if (mox) return { source: "moxfield", id: mox[1] };
  const arch = u.match(/archidekt\.com\/decks\/(\d+)/i);
  if (arch) return { source: "archidekt", id: arch[1] };
  return null;
}

async function fetchMoxfieldDeck(deckId: string): Promise<{ commander: string; title: string; cards: Array<{ name: string; qty: number }> } | null> {
  const res = await fetch(`https://api.moxfield.com/v2/decks/all/${deckId}`, {
    headers: {
      "User-Agent": "ManaTap-AI/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const commanders = data.commanders as Record<string, { card?: { name?: string }; quantity?: number }> | undefined;
  const mainboard = data.mainboard as Record<string, { quantity?: number }> | undefined;
  if (!commanders || !mainboard) return null;
  const commanderEntry = Object.values(commanders)[0];
  const commander = commanderEntry?.card?.name;
  if (!commander) return null;
  const cards: Array<{ name: string; qty: number }> = [];
  for (const [name, entry] of Object.entries(mainboard)) {
    if (name.toLowerCase() !== commander.toLowerCase()) {
      cards.push({ name, qty: entry?.quantity ?? 1 });
    }
  }
  cards.push({ name: commander, qty: 1 });
  const total = cards.reduce((s, c) => s + c.qty, 0);
  if (total < 96 || total > 101) return null;
  return {
    commander,
    title: (data.name as string) || `${commander} - Imported`,
    cards,
  };
}

async function fetchArchidektDeck(deckId: string): Promise<{ commander: string; title: string; cards: Array<{ name: string; qty: number }> } | null> {
  const res = await fetch(`https://archidekt.com/api/decks/${deckId}/`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    name?: string;
    cards?: Array<{
      quantity: number;
      categories?: string[] | null;
      card?: { oracleCard?: { name?: string } };
    }>;
  };
  const cardList = data.cards;
  if (!Array.isArray(cardList) || cardList.length === 0) return null;
  const commanderCard = cardList.find((c) => c.categories?.includes("Commander"));
  const commander = commanderCard?.card?.oracleCard?.name;
  if (!commander) return null;
  const cards: Array<{ name: string; qty: number }> = [];
  for (const c of cardList) {
    const name = c.card?.oracleCard?.name;
    if (name && c.quantity > 0) cards.push({ name, qty: c.quantity });
  }
  const total = cards.reduce((s, c) => s + c.qty, 0);
  if (total < 96 || total > 101) return null;
  return {
    commander,
    title: data.name || `${commander} - Imported`,
    cards,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === "string") : [];
    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "urls array required" }, { status: 400 });
    }
    if (urls.length > MAX_URLS) {
      return NextResponse.json({ ok: false, error: `Max ${MAX_URLS} URLs per request` }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
    }

    const results: Array<{ url: string; title: string; success: boolean; error?: string; deckId?: string }> = [];
    const seen = new Set<string>();

    for (const url of urls) {
      const parsed = extractDeckId(url);
      if (!parsed) {
        results.push({ url, title: "", success: false, error: "Invalid URL (need moxfield.com/decks/... or archidekt.com/decks/...)" });
        continue;
      }
      const key = `${parsed.source}:${parsed.id}`;
      if (seen.has(key)) {
        results.push({ url, title: "", success: false, error: "Duplicate URL" });
        continue;
      }
      seen.add(key);

      let deck: { commander: string; title: string; cards: Array<{ name: string; qty: number }> } | null = null;
      try {
        if (parsed.source === "moxfield") {
          deck = await fetchMoxfieldDeck(parsed.id);
        } else {
          deck = await fetchArchidektDeck(parsed.id);
        }
      } catch (e) {
        results.push({ url, title: "", success: false, error: String(e) });
        continue;
      }

      if (!deck) {
        results.push({ url, title: "", success: false, error: "Fetch failed or invalid deck (need 96–101 cards)" });
        continue;
      }
      if (containsProfanity(deck.title)) {
        results.push({ url, title: deck.title, success: false, error: "Profanity in title" });
        continue;
      }

      const { data: existing } = await admin
        .from("decks")
        .select("id")
        .eq("title", deck.title)
        .eq("user_id", PUBLIC_DECKS_USER_ID)
        .maybeSingle();

      if (existing) {
        results.push({ url, title: deck.title, success: false, error: "Already exists", deckId: existing.id });
        continue;
      }

      const deckText = deck.cards.map((c) => `${c.qty} ${c.name}`).join("\n");
      const { data: newDeck, error: deckErr } = await admin
        .from("decks")
        .insert({
          user_id: PUBLIC_DECKS_USER_ID,
          title: deck.title,
          format: "Commander",
          plan: "Optimized",
          colors: [],
          currency: "USD",
          deck_text: deckText,
          commander: deck.commander,
          is_public: true,
          public: true,
        })
        .select("id")
        .single();

      if (deckErr || !newDeck) {
        results.push({ url, title: deck.title, success: false, error: deckErr?.message ?? "Insert failed" });
        continue;
      }

      const deckId = newDeck.id as string;
      for (const c of deck.cards) {
        try {
          await admin.from("deck_cards").insert({ deck_id: deckId, name: c.name, qty: c.qty });
        } catch {
          /* ignore */
        }
      }

      results.push({ url, title: deck.title, success: true, deckId });
    }

    const successful = results.filter((r) => r.success).length;
    if (successful > 0) {
      const { pingGoogleSitemap } = await import("@/lib/seo/pingGoogle");
      pingGoogleSitemap().catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      results,
      summary: { total: results.length, successful, failed: results.length - successful },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
