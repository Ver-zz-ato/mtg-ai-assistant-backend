// @server-only

let cached: { ts: number; usd_eur: number; usd_gbp: number; eur_usd: number; gbp_usd: number } | null = null;
const TTL = 12 * 60 * 60 * 1000; // 12h

export async function getRates() {
  const now = Date.now();
  if (cached && now - cached.ts < TTL) return cached;
  try {
    const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR,GBP").catch(() => null as any);
    if (r && r.ok) {
      const j: any = await r.json();
      const eur = Number(j?.rates?.EUR || 0);
      const gbp = Number(j?.rates?.GBP || 0);
      if (eur > 0 && gbp > 0) {
        cached = { ts: now, usd_eur: eur, usd_gbp: gbp, eur_usd: 1 / eur, gbp_usd: 1 / gbp };
        return cached;
      }
    }
  } catch {}
  // Fallback fixed estimate if API fails
  cached = { ts: now, usd_eur: 0.92, usd_gbp: 0.78, eur_usd: 1.0 / 0.92, gbp_usd: 1.0 / 0.78 };
  return cached;
}

export async function convert(amount: number, from: "USD" | "EUR" | "GBP" | string, to: "USD" | "EUR" | "GBP" | string) {
  const A = Number.isFinite(amount) ? Number(amount) : 0;
  const F = String(from || "USD").toUpperCase() as "USD" | "EUR" | "GBP";
  const T = String(to || "USD").toUpperCase() as "USD" | "EUR" | "GBP";
  if (!Number.isFinite(A) || F === T) return A || 0;
  const r = await getRates();
  // Convert via USD pivot
  const toUSD = (amt: number, f: "USD" | "EUR" | "GBP") => {
    if (f === "USD") return amt;
    if (f === "EUR") return amt * r.eur_usd;
    return amt * r.gbp_usd;
  };
  const fromUSD = (amt: number, t: "USD" | "EUR" | "GBP") => {
    if (t === "USD") return amt;
    if (t === "EUR") return amt * r.usd_eur;
    return amt * r.usd_gbp;
  };
  const out = fromUSD(toUSD(A, F), T);
  // round to 2dp for display consistency
  return Math.round((out + Number.EPSILON) * 100) / 100;
}
