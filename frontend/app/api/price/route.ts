type RawCard = {
  name: string;
  image_uris?: { small?: string };
  card_faces?: { image_uris?: { small?: string } }[];
  prices?: { usd?: string | null; eur?: string | null };
  reserved?: boolean;
  edhrec_rank?: number | null;
};

export async function POST(req: Request) {
  type Body = { names?: string[]; currency?: "USD" | "EUR" | "GBP" };
  const { names = [], currency = "USD" } = (await req.json().catch(() => ({}))) as Body;

  const unique = Array.from(new Set<string>(names)).slice(0, 6);

  // fetch rates once
  const rateRes = await fetch(
    "https://api.exchangerate.host/latest?base=USD&symbols=EUR,GBP"
  );
  type Rates = { rates?: { EUR?: number; GBP?: number } };
  const rateJson = (await rateRes.json().catch(() => ({}))) as Rates;
  const usdToGbp = Number(rateJson?.rates?.GBP ?? 0.75);
  const usdToEur = Number(rateJson?.rates?.EUR ?? 0.92);

  async function fetchCard(name: string): Promise<RawCard | null> {
    const r = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
    );
    if (!r.ok) return null;
    return (await r.json()) as RawCard;
  }

  const results = await Promise.all(
    unique.map(async (n) => {
      const card = await fetchCard(n);
      if (!card) return null;

      const usd = card.prices?.usd ? Number(card.prices.usd) : null;
      const eur =
        card.prices?.eur ? Number(card.prices.eur) : usd != null ? usd * usdToEur : null;
      const gbp =
        usd != null ? usd * usdToGbp : eur != null ? eur * (usdToGbp / usdToEur) : null;

      const img =
        card.image_uris?.small ||
        card.card_faces?.[0]?.image_uris?.small ||
        null;

      let risk: "No reprint" | "Normal" | "Elevated" = "Normal";
      if (card.reserved) risk = "No reprint";
      else if ((card.edhrec_rank ?? 999999) < 2000 && ((usd ?? 0) > 15 || (eur ?? 0) > 15))
        risk = "Elevated";

      return { name: card.name, image: img, usd, eur, gbp, risk };
    })
  );

  return Response.json({
    results: results.filter(Boolean),
    meta: { currency }, // use currency so it's not "unused"
  });
}
