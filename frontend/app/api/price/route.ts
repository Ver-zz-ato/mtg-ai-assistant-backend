// frontend/app/api/price/route.ts
import { NextRequest, NextResponse } from "next/server";

// Normalize and fetch a single card's price from Scryfall.
// We prefer: currency -> scryfall "usd"/"eur" (GBP is not directly on Scryfall, so we fallback to usd and mark converted=false).
async function fetchScryfallPrice(name: string, currency: "USD" | "EUR" | "GBP") {
  const exactUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&include_extras=true&include_multilingual=true`;
  const searchUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
    `!"${name}" unique:prints`
  )}`;

  const pullPrice = (card: any): number | null => {
    if (!card || !card.prices) return null;
    // Scryfall offers "usd", "eur". No gbp — we’ll send null and let the UI show "—"
    if (currency === "USD" && card.prices.usd) return parseFloat(card.prices.usd);
    if (currency === "EUR" && card.prices.eur) return parseFloat(card.prices.eur);
    // GBP not native on Scryfall; return null to mark missing (UI will show — and 0 subtotal).
    return null;
  };

  // Try exact first
  try {
    const r = await fetch(exactUrl, { cache: "no-store" });
    if (r.ok) {
      const c = await r.json();
      const price = pullPrice(c);
      if (typeof price === "number" && !Number.isNaN(price)) {
        return { name, unit: price, found: true };
      }
    }
  } catch {
    // ignore
  }

  // Fallback: search
  try {
    const r2 = await fetch(searchUrl, { cache: "no-store" });
    if (r2.ok) {
      const j = await r2.json();
      if (j?.data?.length) {
        // Prefer the first printing that actually has a price in the requested currency
        for (const cand of j.data) {
          const price = pullPrice(cand);
          if (typeof price === "number" && !Number.isNaN(price)) {
            return { name, unit: price, found: true };
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // Not found for requested currency
  return { name, unit: 0, found: false };
}

export async function POST(req: NextRequest) {
  try {
    const { names, currency } = await req.json();

    if (!Array.isArray(names) || !names.length) {
      return NextResponse.json(
        { error: "Provide { names: string[] }" },
        { status: 400 }
      );
    }

    const cur =
      currency && ["USD", "EUR", "GBP"].includes(currency.toUpperCase())
        ? (currency.toUpperCase() as "USD" | "EUR" | "GBP")
        : "USD";

    // Unique names only (avoid duplicate Scryfall calls)
    const uniq = Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));

    const results = await Promise.all(
      uniq.map((n) => fetchScryfallPrice(n, cur))
    );

    // Return a map for quick join on the UI side
    const byName: Record<string, { unit: number; found: boolean }> = {};
    for (const r of results) {
      byName[r.name.toLowerCase()] = { unit: r.unit, found: r.found };
    }

    return NextResponse.json({ ok: true, currency: cur, prices: byName });
  } catch (e) {
    return NextResponse.json(
      { error: "Price lookup failed" },
      { status: 500 }
    );
  }
}
