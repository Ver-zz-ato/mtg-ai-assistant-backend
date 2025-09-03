import { NextRequest, NextResponse } from "next/server";

type Currency = "USD" | "EUR" | "GBP";

type ScryfallCard = {
  name: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  prices: { usd: string | null; eur: string | null };
};

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

    // Hit Scryfall
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

    const byLower = new Map<string, ScryfallCard>();
    for (const c of returned) byLower.set(c.name.toLowerCase(), c);

    const usdToGbp = currency === "GBP" ? await getUsdToGbp() : 1;

    type Row = { name: string; image: string | null; unit: number };
    const results: Row[] = [];
    const prices: Record<string, Row> = {}; // ← name-keyed map (lowercased keys)

    for (const requestedName of names) {
      const key = requestedName.toLowerCase();
      const card = byLower.get(key);

      const usd = card?.prices.usd ? Number(card.prices.usd) : null;
      const eur = card?.prices.eur ? Number(card.prices.eur) : null;

      let unit: number | null = null;
      if (currency === "USD") unit = usd;
      else if (currency === "EUR") unit = eur;
      else if (currency === "GBP") unit = usd !== null ? usd * usdToGbp : null;

      const row: Row = {
        name: requestedName,                    // echo back requested spelling
        image: card ? pickImage(card) : null,
        unit: Number.isFinite(unit!) ? Number(unit!.toFixed(2)) : 0, // default 0 if missing
      };

      results.push(row);
      prices[key] = row; // ensure the map always has a value
    }

    return NextResponse.json({ ok: true, currency, results, prices });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
