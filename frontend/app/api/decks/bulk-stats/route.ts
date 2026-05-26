import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { convert } from "@/lib/currency/rates";
import { z } from "zod";

const BodySchema = z.object({
  deckIds: z.array(z.string().uuid()).min(1).max(100), // Max 100 decks at a time for performance
  currency: z.enum(["USD", "EUR", "GBP"]).optional().default("USD"),
});

function normalizePriceCacheName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€™'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request: deckIds must be a non-empty array of UUIDs (max 100)" },
        { status: 400 }
      );
    }

    const { deckIds, currency } = parsed.data;

    // Verify all decks belong to the user (security check)
    const { data: decks, error: decksError } = await supabase
      .from("decks")
      .select("id")
      .eq("user_id", user.id)
      .in("id", deckIds);

    if (decksError) {
      return NextResponse.json({ ok: false, error: decksError.message }, { status: 500 });
    }

    const validDeckIds = new Set((decks || []).map(d => d.id));
    const filteredDeckIds = deckIds.filter(id => validDeckIds.has(id));

    if (filteredDeckIds.length === 0) {
      return NextResponse.json({ ok: true, stats: {} });
    }

    // Fetch card counts and names for all decks in parallel (single query)
    const { data: cardsData, error: cardsError } = await supabase
      .from("deck_cards")
      .select("deck_id, name, qty")
      .in("deck_id", filteredDeckIds);

    if (cardsError) {
      return NextResponse.json({ ok: false, error: cardsError.message }, { status: 500 });
    }

    // Calculate card counts per deck
    const cardCounts = new Map<string, number>();
    const deckValues = new Map<string, number>();
    const uniquePriceKeys = new Set<string>();
    for (const card of cardsData || []) {
      const current = cardCounts.get(card.deck_id) || 0;
      cardCounts.set(card.deck_id, current + (card.qty || 0));
      const key = normalizePriceCacheName(card.name || "");
      if (key) uniquePriceKeys.add(key);
    }

    const priceByKey = new Map<string, number>();
    for (const keys of chunk(Array.from(uniquePriceKeys), 500)) {
      const { data: priceRows } = await supabase
        .from("price_cache")
        .select("card_name, usd_price, eur_price")
        .in("card_name", keys);

      for (const row of priceRows || []) {
        const key = normalizePriceCacheName(row.card_name || "");
        let price = currency === "EUR" ? Number(row.eur_price) : Number(row.usd_price);
        if ((!Number.isFinite(price) || price <= 0) && currency === "EUR") {
          price = await convert(Number(row.usd_price) || 0, "USD", "EUR");
        }
        if (currency === "GBP") {
          price = await convert(Number(row.usd_price) || 0, "USD", "GBP");
        }
        if (key && Number.isFinite(price) && price > 0) {
          priceByKey.set(key, price);
        }
      }
    }

    for (const card of cardsData || []) {
      const key = normalizePriceCacheName(card.name || "");
      const price = key ? priceByKey.get(key) || 0 : 0;
      if (price <= 0) continue;
      const current = deckValues.get(card.deck_id) || 0;
      deckValues.set(card.deck_id, current + price * (card.qty || 0));
    }

    // Fetch tags for all decks in parallel (single query)
    const { data: tagsData, error: tagsError } = await supabase
      .from("deck_tags")
      .select("deck_id, tag")
      .in("deck_id", filteredDeckIds);

    if (tagsError) {
      return NextResponse.json({ ok: false, error: tagsError.message }, { status: 500 });
    }

    // Group tags by deck
    const tagsMap = new Map<string, string[]>();
    for (const tag of tagsData || []) {
      const existing = tagsMap.get(tag.deck_id) || [];
      if (tag.tag) {
        existing.push(tag.tag);
      }
      tagsMap.set(tag.deck_id, existing);
    }

    // Build response: map deck_id -> { cardCount, tags, estimatedValue }
    const stats: Record<string, { cardCount: number; tags: string[]; estimatedValue: number }> = {};
    for (const deckId of filteredDeckIds) {
      stats[deckId] = {
        cardCount: cardCounts.get(deckId) || 0,
        tags: tagsMap.get(deckId) || [],
        estimatedValue: Math.round((deckValues.get(deckId) || 0) * 100) / 100,
      };
    }

    return NextResponse.json({ ok: true, stats });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
