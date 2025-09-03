// frontend/app/api/price/route.ts
import { NextRequest, NextResponse } from "next/server";

// Simple in-memory FX cache (per server instance)
let fxCache: { ts: number; USD_GBP: number; EUR_GBP: number } | null = null;

async function getFx(): Promise<{ USD_GBP: number; EUR_GBP: number }> {
  const now = Date.now();
  if (fxCache && now - fxCache.ts < 1000 * 60 * 30) return fxCache; // 30 min cache

  // Fetch once; exchangerate.host is free/no-key
  const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=GBP,EUR", { cache: "no-store" });
  const j = await r.json();
  const USD_GBP = j?.rates?.GBP ?? 0;

  const r2 = await fetch("https://api.exchangerate.host/latest?base=EUR&symbols=GBP,USD", { cache: "no-store" });
  const j2 = await r2.json();
  const EUR_GBP = j2?.rates?.GBP ?? 0;

  fxCache = { ts: now, USD_GBP, EUR_GBP };
  return fxCache;
}

async function scryfallExact(name: string) {
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&include_extras=true&include_multilingual=true`;
  const r = await fetch(url, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

async function scryfallSearch(name: string) {
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" unique:prints`)}`;
  const r = await fetch(url, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

type Cur = "USD" | "EUR" | "GBP";

function pickPrice(card: any, currency: Cur): number | null {
  if (!card?.prices) return null;
  if (currency === "USD" && card.prices.usd) return parseFloat(card.prices.usd);
  if (currency === "EUR" && card.prices.eur) return parseFloat(card.prices.eur);
  return null;
}

async function fetchPrice(name: string, currency: Cur) {
  const fx = await getFx();

  const tryCard = (card: any): number | null => {
    // Direct
    const direct = pickPrice(card, currency);
    if (typeof direct === "number") return direct;

    // Conversions for GBP only
    if (currency === "GBP") {
      const usd = card?.prices?.usd ? parseFloat(card.prices.usd) : null;
      const eur = card?.prices?.eur ? parseFloat(card.prices.eur) : null;

      if (typeof usd === "number" && fx.USD_GBP) return usd * fx.USD_GBP;
      if (typeof eur === "number" && fx.EUR_GBP) return eur * fx.EUR_GBP;
    }

    return null;
  };

  // exact
  const exact = await scryfallExact(name);
  let price = tryCard(exact);
  if (typeof price === "number" && !Number.isNaN(price)) return { name, unit: price, found: true };

  // search fallback
  const search = await scryfallSearch(name);
  if (search?.data?.length) {
    for (const cand of search.data) {
      price = tryCard(cand);
      if (typeof price === "number" && !Number.isNaN(price)) {
        return { name, unit: price, found: true };
      }
    }
  }

  return { name, unit: 0, found: false };
}

export async function POST(req: NextRequest) {
  try {
    const { names, currency } = await req.json();
    if (!Array.isArray(names) || !names.length)
      return NextResponse.json({ error: "Provide { names: string[] }" }, { status: 400 });

    const cur: Cur = (["USD", "EUR", "GBP"].includes((currency || "").toUpperCase())
      ? (currency || "USD").toUpperCase()
      : "USD") as Cur;

    const uniq = Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));

    const results = await Promise.all(uniq.map((n) => fetchPrice(n, cur)));

    const prices: Record<string, { unit: number; found: boolean }> = {};
    for (const r of results) prices[r.name.toLowerCase()] = { unit: r.unit, found: r.found };

    return NextResponse.json({ ok: true, currency: cur, prices });
  } catch (e) {
    return NextResponse.json({ error: "Price lookup failed" }, { status: 500 });
  }
}
