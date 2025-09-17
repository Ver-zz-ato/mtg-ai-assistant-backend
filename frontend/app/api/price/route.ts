// app/api/price/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withLogging } from "@/lib/api/withLogging";
import { ok, err } from "@/lib/api/envelope";
import { PriceBody } from "@/lib/validation";

/**
 * Normalize a card name so the client and server use the exact same key.
 * - lowercase
 * - trim
 * - collapse spaces
 * - strip weird quotes and diacritics
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type Currency = "USD" | "EUR" | "GBP";

type PriceMap = Record<string, number>;

type ScryfallCard = {
  name: string;
  prices: {
    usd: string | null;
    eur: string | null;
    // scryfall does **not** provide gbp; we'll derive it
  };
};

// ---- Simple in-memory cache for FX rates (avoid hammering the API)
let fxCache: {
  at: number;
  USD_EUR: number;
  USD_GBP: number;
} | null = null;

async function getFxRates(): Promise<{ USD_EUR: number; USD_GBP: number }> {
  // Reuse for 4 hours
  const TTL_MS = 4 * 60 * 60 * 1000;
  if (fxCache && Date.now() - fxCache.at < TTL_MS) {
    return { USD_EUR: fxCache.USD_EUR, USD_GBP: fxCache.USD_GBP };
  }

  // exchangerate.host is free/anonymous & very reliable
  const url = "https://api.exchangerate.host/latest?base=USD&symbols=EUR,GBP";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // very defensive: fall back to safe-ish constants (won't be perfect, but better than 0s)
    const fallback = { USD_EUR: 0.92, USD_GBP: 0.78 };
    fxCache = { at: Date.now(), ...fallback };
    return fallback;
  }
  const data = (await res.json()) as { rates?: { EUR?: number; GBP?: number } };

  const USD_EUR = data?.rates?.EUR ?? 0.92;
  const USD_GBP = data?.rates?.GBP ?? 0.78;

  fxCache = { at: Date.now(), USD_EUR, USD_GBP };
  return { USD_EUR, USD_GBP };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetches one representative printing for each name via Scryfall's collection API.
 * We dedupe the input and cap to Scryfall's limit (75 ids per request).
 */
async function fetchScryfallPrices(names: string[]): Promise<Record<string, ScryfallCard>> {
  const byNorm: Record<string, ScryfallCard> = {};
  const unique = Array.from(new Set(names.map(normalizeName)));

  // Scryfall /cards/collection allows up to 75 identifiers per call
  for (const batch of chunk(unique, 75)) {
    const body = {
      identifiers: batch.map((n) => ({ name: n })),
    };
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // no-store so we don't get stale prices
      cache: "no-store",
    });

    if (!res.ok) {
      // keep going for other batches; the client will gracefully handle missing prices
      continue;
    }
    const data = (await res.json()) as { data?: ScryfallCard[] };

    for (const c of data?.data ?? []) {
      const norm = normalizeName(c.name);
      // only set the first time we see it (dedupe by normalized name)
      if (!byNorm[norm]) byNorm[norm] = c;
    }
  }

  return byNorm;
}

/**
 * Compute a numeric unit price in the desired currency with fallbacks.
 *  - USD/EUR: use Scryfall direct price; if missing -> convert from USD if available
 *  - GBP: always derived from USD via FX
 */
async function toCurrencyUnit(card: ScryfallCard | undefined, currency: Currency): Promise<number> {
  if (!card) return 0;

  const { USD_EUR, USD_GBP } = await getFxRates();

  const usdRaw = card.prices.usd ? Number(card.prices.usd) : null;
  const eurRaw = card.prices.eur ? Number(card.prices.eur) : null;

  if (currency === "USD") {
    return usdRaw ?? 0;
  }
  if (currency === "EUR") {
    if (eurRaw != null) return eurRaw;
    if (usdRaw != null) return +(usdRaw * USD_EUR).toFixed(2);
    return 0;
  }
  // GBP
  if (usdRaw != null) return +(usdRaw * USD_GBP).toFixed(2);
  if (eurRaw != null) return +(eurRaw * (1 / USD_EUR) * USD_GBP).toFixed(2);
  return 0;
}

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const { names, currency } = (await req.json()) as {
      names: string[];
      currency?: Currency;
    };

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: true, prices: {}, currency: currency ?? "USD", missing: [] });
    }

    const want: Currency = (currency ?? "USD").toUpperCase() as Currency;

    // Fetch raw Scryfall prices
    const scry = await fetchScryfallPrices(names);

    // Build the final price map keyed by *normalized name*
    const prices: PriceMap = {};
    const missing: string[] = [];

    // Compute price for each incoming name (not just the deduped set)
    for (const raw of names) {
      const norm = normalizeName(raw);
      const card = scry[norm];
      const unit = await toCurrencyUnit(card, want);
      if (unit === 0) missing.push(raw);
      prices[norm] = unit;
    }

    return NextResponse.json({ ok: true, currency: want, prices, missing });
  } catch (err) {
    // Never throw HTML at the client; always JSON with a friendly message.
    return NextResponse.json(
      {
        ok: false,
        error: "Price lookup failed",
        detail: (err as Error)?.message ?? String(err),
      },
      { status: 200 }
    );
  }
});