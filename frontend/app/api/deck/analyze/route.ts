// Typed Scryfall-backed deck snapshot.

type SfCard = {
  name: string;
  type_line?: string;
  oracle_text?: string | null;
  color_identity?: string[];
};

declare global {
  var __sfCache: Map<string, SfCard> | undefined;
}
const sfCache: Map<string, SfCard> = globalThis.__sfCache ?? new Map();
globalThis.__sfCache = sfCache;

async function fetchCard(name: string): Promise<SfCard | null> {
  const key = name.toLowerCase();
  if (sfCache.has(key)) return sfCache.get(key)!;

  type ScryfallNamed = {
    name: string;
    type_line?: string;
    oracle_text?: string | null;
    card_faces?: { oracle_text?: string | null }[];
    color_identity?: string[];
  };

  const r = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
  );
  if (!r.ok) return null;
  const j = (await r.json()) as ScryfallNamed;

  const card: SfCard = {
    name: j.name,
    type_line: j.type_line,
    oracle_text: j.oracle_text ?? j.card_faces?.[0]?.oracle_text ?? null,
    color_identity: j.color_identity ?? [],
  };
  sfCache.set(key, card);
  return card;
}

export async function POST(req: Request) {
  const started = Date.now();
  console.log("[api/deck/analyze] POST start");

  type AnalyzeBody = {
    deckText?: string;
    format?: "Commander" | "Modern" | "Pioneer";
    plan?: "Budget" | "Optimized";
    colors?: string[];
    currency?: "USD" | "EUR" | "GBP";
    useScryfall?: boolean;
  };

  const body = (await req.json().catch(() => ({}))) as AnalyzeBody;

  const deckText: string = body.deckText ?? "";
  const format: "Commander" | "Modern" | "Pioneer" = body.format ?? "Commander";
  const plan: "Budget" | "Optimized" = body.plan ?? "Optimized";
  const useScryfall: boolean = Boolean(body.useScryfall);

  const lines = deckText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s));

  // parse counts + names
  const entries = lines.map((l) => {
    const m = l.match(/^(\d+)\s*x?\s*(.+)$/i);
    const count = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : l).replace(/\s*\(.*?\)\s*$/, "").trim();
    return { count: Number.isFinite(count) ? count : 1, name };
  });

  const totalCards = entries.reduce((s, e) => s + e.count, 0);

  // tallies
  let lands = 0,
    draw = 0,
    ramp = 0,
    removal = 0;

  if (useScryfall) {
    const uniqueNames = Array.from(new Set(entries.map((e) => e.name))).slice(
      0,
      80
    );
    const looked = await Promise.all(uniqueNames.map(fetchCard));
    const byName = new Map(
      looked.filter((c): c is SfCard => Boolean(c)).map((c) => [
        c.name.toLowerCase(),
        c,
      ])
    );

    const landRe = /land/i;
    const drawRe = /draw a card|scry [1-9]/i;
    const rampRe =
      /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
    const killRe = /destroy target|exile target|counter target/i;

    for (const { name, count } of entries) {
      const c = byName.get(name.toLowerCase());
      const t = c?.type_line ?? "";
      const o = c?.oracle_text ?? "";
      if (landRe.test(t)) lands += count;
      if (drawRe.test(o)) draw += count;
      if (rampRe.test(o) || /signet|talisman|sol ring/i.test(name)) ramp += count;
      if (killRe.test(o)) removal += count;
    }
  } else {
    const landRx =
      /\b(Island|Swamp|Plains|Forest|Mountain|Gate|Temple|Land)\b/i;
    const drawRx =
      /\b(Draw|Opt|Ponder|Brainstorm|Read the Bones|Sign in Blood|Beast Whisperer|Inspiring Call)\b/i;
    const rampRx =
      /\b(Rampant Growth|Cultivate|Kodama's|Solemn|Signet|Talisman|Sol Ring|Arcane Signet|Fellwar Stone)\b/i;
    const removalRx =
      /\b(Removal|Swords to Plowshares|Path to Exile|Terminate|Go for the Throat|Beast Within)\b/i;

    lands = entries
      .filter((e) => landRx.test(e.name))
      .reduce((s, e) => s + e.count, 0);
    draw = entries
      .filter((e) => drawRx.test(e.name))
      .reduce((s, e) => s + e.count, 0);
    ramp = entries
      .filter((e) => rampRx.test(e.name))
      .reduce((s, e) => s + e.count, 0);
    removal = entries
      .filter((e) => removalRx.test(e.name))
      .reduce((s, e) => s + e.count, 0);
  }

  // format-aware expectations
  const landTarget = format === "Commander" ? 35 : 24;
  const manaBand =
    lands >= landTarget ? 0.8 : lands >= landTarget - 2 ? 0.7 : 0.55;

  const bands = {
    curve: Math.min(
      1,
      Math.max(
        0.5,
        0.8 -
          Math.max(0, totalCards - (format === "Commander" ? 100 : 60)) * 0.001
      )
    ),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.2),
    mana: Math.min(1, manaBand),
  };

  const score = Math.round(
    (bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20
  );

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  if (lands >= landTarget)
    whatsGood.push(`Mana base looks stable for ${format}.`);
  else
    quickFixes.push(
      `Add ${
        format === "Commander" ? "2–3" : "1–2"
      } lands (aim ${landTarget}${format === "Commander" ? " for EDH" : ""}).`
    );

  if (ramp >= 8) whatsGood.push("Healthy ramp density.");
  else
    quickFixes.push(
      "Add 2 cheap rocks: <em>Arcane Signet</em>, <em>Fellwar Stone</em>."
    );

  if (draw >= 8) whatsGood.push("Card draw density looks fine.");
  else
    quickFixes.push(
      "Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>."
    );

  if (removal < 5)
    quickFixes.push(
      `Add 1–2 interaction pieces: <em>Swords to Plowshares</em>, <em>Path to Exile</em>.`
    );

  const note =
    draw < 6
      ? "needs a touch more draw"
      : lands < landTarget - 2
      ? "mana base is light"
      : "solid, room to tune";

  console.log(
    `[api/deck/analyze] 200 in ${Date.now() - started}ms (len=${deckText.length})`
  );
  return Response.json({
    score,
    note,
    bands,
    whatsGood: whatsGood.length ? whatsGood : ["Core plan looks coherent."],
    quickFixes:
      plan === "Budget"
        ? quickFixes.map((s) =>
            s.replace("Beast Whisperer", "Guardian Project")
          )
        : quickFixes,
  });
}
