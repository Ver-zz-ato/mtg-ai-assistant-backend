// frontend/app/api/price/route.ts
import { NextRequest, NextResponse } from "next/server";

type Currency = "USD" | "EUR" | "GBP";

type ScryfallCard = {
  name: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  prices: { usd: string | null; eur: string | null; tix?: string | null };
};

// --- very light in-memory cache for the USD->GBP rate
let fxCache: { rate: number; fetchedAt: number } | null = null;
const TEN_MIN = 10 * 60 * 1000;

async function getUsdToGbp(): Promise<number> {
  if (fxCache && Date.now() - fxCache.fetchedAt < TEN_MIN) return fxCache.rate;

  // any reliable free endpoint works; exchangerate.host is solid
  const r = await fetch(
    "https://api.exchangerate.host/latest?base=USD&symbols=GBP",
    { cache: "no-store" }
  );
  const j = await r.json();
  const rate = Number(j?.rates?.GBP);
  if (!Number.isFinite(rate)) throw new Error("FX rate unavailable");
  fxCache = { rate, fetchedAt: Date.now() };
  return rate;
}

function pickImage(card: ScryfallCard) {
  return (
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.image_uris?.small ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const { names, currency = "USD" } = (await req.json()) as {
      names: string[];
      currency?: Currency;
    };

    if (!Array.isArray(names) || !names.length) {
      return NextResponse.json({ ok: false, error: "No names" }, { status: 400 });
    }

    // batch via Scryfall /cards/collection
    const r = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifiers: names.map((n) => ({ name: n })),
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json({ ok: false, error: txt }, { status: r.status });
    }

    const data = (await r.json()) as { data: ScryfallCard[] };

    // FX for GBP if needed
    const usdToGbp = currency === "GBP" ? await getUsdToGbp() : 1;

    const results = data.data.map((c) => {
      const usd = c.prices.usd ? Number(c.prices.usd) : null;
      const eur = c.prices.eur ? Number(c.prices.eur) : null;

      let unit: number | null = null;
      if (currency === "USD") unit = usd;
      else if (currency === "EUR") unit = eur;
      else if (currency === "GBP") unit = usd !== null ? usd * usdToGbp : null;

      return {
        name: c.name,
        image: pickImage(c),
        unit: Number.isFinite(unit!) ? Number(unit!.toFixed(2)) : 0,
      };
    });

    return NextResponse.json({ ok: true, results, currency });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
