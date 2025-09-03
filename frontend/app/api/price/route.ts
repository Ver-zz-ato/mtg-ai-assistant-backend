// app/api/price/route.ts
import { NextRequest, NextResponse } from "next/server";

type Currency = "USD" | "EUR" | "GBP";

type ScryfallCard = {
  name: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  prices: { usd: string | null; eur: string | null; tix?: string | null };
};

// --- tiny cache for USD->GBP
let fxCache: { rate: number; fetchedAt: number } | null = null;
const TEN_MIN = 10 * 60 * 1000;

async function getUsdToGbp(): Promise<number> {
  if (fxCache && Date.now() - fxCache.fetchedAt < TEN_MIN) return fxCache.rate;
  const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=GBP", { cache: "no-store" });
  const j = await r.json();
  const rate = Number(j?.rates?.GBP);
  if (!Number.isFinite(rate)) throw new Error("FX rate unavailable");
  fxCache = { rate, fetchedAt: Date.now() };
  return rate;
}

function pickImage(c: ScryfallCard) {
  return c.image_uris?.normal || c.image_uris?.large || c.image_uris?.small || null;
}

export async function POST(req: NextRequest) {
  try {
    const { names, currency = "USD" } = (await req.json()) as {
      names: string[];
      currency?: Currency;
    };

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: false, error: "No names" }, { status: 400 });
    }

    // Hit Scryfall once
    const r = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: names.map((n) => ({ name: n })) }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json({ ok: false, error: txt }, { status: r.status });
    }

    const payload = await r.json();
    const returned: ScryfallCard[] = Array.isArray(payload?.data) ? payload.data : [];

    // Build case-insensitive lookup from returned data
    const byLower = new Map<string, ScryfallCard>();
    for (const c of returned) byLower.set(c.name.toLowerCase(), c);

    // FX for GBP if needed (EUR is native in Scryfall)
    const usdToGbp = currency === "GBP" ? await getUsdToGbp() : 1;

    // IMPORTANT: iterate over requested names to always emit a row
    const results = names.map((requestedName) => {
      const card = byLower.get(requestedName.toLowerCase());

      const usd = card?.prices.usd ? Number(card.prices.usd) : null;
      const eur = card?.prices.eur ? Number(card.prices.eur) : null;

      let unit: number | null = null;
      if (currency === "USD") unit = usd;
      else if (currency === "EUR") unit = eur;
      else if (currency === "GBP") unit = usd !== null ? usd * usdToGbp : null;

      return {
        name: requestedName,                // echo back the name you asked for
        image: card ? pickImage(card) : null,
        unit: Number.isFinite(unit!) ? Number(unit!.toFixed(2)) : 0, // 0 when not found
      };
    });

    return NextResponse.json({ ok: true, results, currency });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
