// app/api/deck/analyze/route.ts

import fs from "node:fs/promises";
import path from "node:path";

// --- Minimal typed Scryfall card for our needs ---
type SfCard = {
  name: string;
  type_line?: string;
  oracle_text?: string | null;
  color_identity?: string[]; // e.g. ["G","B"]
  cmc?: number;
  legalities?: Record<string, string>;
};

// Simple in-process cache (persists across hot reloads on server)
declare global {
  // eslint-disable-next-line no-var
  var __sfCacheAnalyze: Map<string, SfCard> | undefined;
}
const sfCache: Map<string, SfCard> = globalThis.__sfCacheAnalyze ?? new Map();
globalThis.__sfCacheAnalyze = sfCache;

async function fetchCard(name: string): Promise<SfCard | null> {
  const key = name.toLowerCase();
  if (sfCache.has(key)) return sfCache.get(key)!;

  type ScryfallNamed = {
    name: string;
    type_line?: string;
    oracle_text?: string | null;
    card_faces?: { oracle_text?: string | null }[];
    color_identity?: string[];
    cmc?: number;
    legalities?: Record<string, string>;
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
    cmc: typeof j.cmc === "number" ? j.cmc : undefined,
    legalities: j.legalities ?? {},
  };
  sfCache.set(key, card);
  return card;
}

export async function POST(req: Request) {
  const t0 = Date.now();

  type AnalyzeBody = {
    deckText?: string;
    format?: "Commander" | "Modern" | "Pioneer";
    plan?: "Budget" | "Optimized";
    colors?: string[]; // e.g. ["G","B"]
    currency?: "USD" | "EUR" | "GBP";
    useScryfall?: boolean; // true = do real lookups
  };

  const body = (await req.json().catch(() => ({}))) as AnalyzeBody;

  const deckText: string = body.deckText ?? "";
  const format: "Commander" | "Modern" | "Pioneer" = body.format ?? "Commander";
  const plan: "Budget" | "Optimized" = body.plan ?? "Optimized";
  const useScryfall: boolean = Boolean(body.useScryfall);
  const selectedColors: string[] = Array.isArray(body.colors) ? body.colors : [];

  // Parse text into entries {count, name}
  const lines = deckText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s));

  const entries = lines.map((l) => {
    const m = l.match(/^(\d+)\s*x?\s*(.+)$/i);
    const count = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : l).replace(/\s*\(.*?\)\s*$/, "").trim();
    return { count: Number.isFinite(count) ? count : 1, name };
  });

  const totalCards = entries.reduce((s, e) => s + e.count, 0);

  // Tally bands
  let lands = 0,
    draw = 0,
    ramp = 0,
    removal = 0;

  // Curve buckets: [<=1, 2, 3, 4, >=5]
  const curveBuckets = [0, 0, 0, 0, 0];

  // Store Scryfall results by name for reuse + legality
  const byName = new Map<string, SfCard>();

  if (useScryfall) {
    const unique = Array.from(new Set(entries.map((e) => e.name))).slice(0, 160);
    const looked = await Promise.all(unique.map(fetchCard));
    for (const c of looked) {
      if (c) byName.set(c.name.toLowerCase(), c);
    }

    const landRe = /land/i;
    const drawRe = /draw a card|scry [1-9]/i;
    const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
    const killRe = /destroy target|exile target|counter target/i;

    for (const { name, count } of entries) {
      const c = byName.get(name.toLowerCase());
      const t = c?.type_line ?? "";
      const o = c?.oracle_text ?? "";
      if (landRe.test(t)) lands += count;
      if (drawRe.test(o)) draw += count;
      if (rampRe.test(o) || /signet|talisman|sol ring/i.test(name)) ramp += count;
      if (killRe.test(o)) removal += count;

      // CMC bucket
      const cmc = typeof c?.cmc === "number" ? c!.cmc : undefined;
      if (typeof cmc === "number") {
        if (cmc <= 1) curveBuckets[0] += count;
        else if (cmc <= 2) curveBuckets[1] += count;
        else if (cmc <= 3) curveBuckets[2] += count;
        else if (cmc <= 4) curveBuckets[3] += count;
        else curveBuckets[4] += count;
      }
    }
  } else {
    const landRx = /\b(Island|Swamp|Plains|Forest|Mountain|Gate|Temple|Land)\b/i;
    const drawRx =
      /\b(Draw|Opt|Ponder|Brainstorm|Read the Bones|Sign in Blood|Beast Whisperer|Inspiring Call)\b/i;
    const rampRx =
      /\b(Rampant Growth|Cultivate|Kodama's|Solemn|Signet|Talisman|Sol Ring|Arcane Signet|Fellwar Stone)\b/i;
    const removalRx =
      /\b(Removal|Swords to Plowshares|Path to Exile|Terminate|Go for the Throat|Beast Within)\b/i;

    lands = entries.filter((e) => landRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    draw = entries.filter((e) => drawRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    ramp = entries.filter((e) => rampRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    removal = entries.filter((e) => removalRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    // No CMC data without Scryfall; buckets remain 0s.
  }

  // Simple curve band from deck size; ramp/draw/removal normalized
  const landTarget = format === "Commander" ? 35 : 24;
  const manaBand = lands >= landTarget ? 0.8 : lands >= landTarget - 2 ? 0.7 : 0.55;

  const bands = {
    curve: Math.min(1, Math.max(0.5, 0.8 - Math.max(0, totalCards - (format === "Commander" ? 100 : 60)) * 0.001)),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.2),
    mana: Math.min(1, manaBand),
  };

  const score = Math.round((bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20);

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  if (lands >= landTarget) whatsGood.push(`Mana base looks stable for ${format}.`);
  else quickFixes.push(`Add ${format === "Commander" ? "2–3" : "1–2"} lands (aim ${landTarget}${format === "Commander" ? " for EDH" : ""}).`);

  if (ramp >= 8) whatsGood.push("Healthy ramp density.");
  else quickFixes.push("Add 2 cheap rocks: <em>Arcane Signet</em>, <em>Fellwar Stone</em>.");

  if (draw >= 8) whatsGood.push("Card draw density looks fine.");
  else quickFixes.push("Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>.");

  if (removal < 5) quickFixes.push(`Add 1–2 interaction pieces: <em>Swords to Plowshares</em>, <em>Path to Exile</em>.`);

  // --- NEW: Commander color-identity legality check (requires Scryfall + colors) ---
  let illegalByCI = 0;
  let illegalExamples: string[] = [];

  // --- NEW: Banned cards for selected format ---
  let bannedCount = 0;
  let bannedExamples: string[] = [];

  if (format === "Commander" && useScryfall) {
    // Banned list via Scryfall legalities
    const banned: string[] = [];
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;
      if ((c.legalities?.commander || '').toLowerCase() === 'banned') banned.push(c.name);
    }
    const uniqBanned = Array.from(new Set(banned));
    bannedCount = uniqBanned.length;
    bannedExamples = uniqBanned.slice(0, 5);
  }

  if (format === "Commander" && useScryfall && selectedColors.length > 0) {
    const allowed = new Set(selectedColors.map((c) => c.toUpperCase())); // e.g. G,B
    const offenders: string[] = [];

    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;

      const ci = (c.color_identity ?? []).map((x) => x.toUpperCase());
      const illegal = ci.length > 0 && ci.some((symbol) => !allowed.has(symbol));
      if (illegal) offenders.push(c.name);
    }

    const uniqueOffenders = Array.from(new Set(offenders));
    illegalByCI = uniqueOffenders.length;
    illegalExamples = uniqueOffenders.slice(0, 5);
  }

  // --- NEW: curve-aware quick fixes (format-aware targets) ---
  if (useScryfall) {
    const [b01, b2, b3, b4, b5p] = curveBuckets;
    if (format === "Commander") {
      // loose, friendly targets for 100-card singleton decks
      if (b2 < 12) quickFixes.push("Fill the 2-drop gap (aim ~12): cheap dorks, signets/talismans, utility bears.");
      if (b01 < 8) quickFixes.push("Add 1–2 more one-drops: ramp dorks or cheap interaction.");
      if (b5p > 16) quickFixes.push("Top-end is heavy; trim a few 5+ CMC spells for smoother starts.");
    } else {
      // 60-card formats: suggest smoothing low curve
      if (b01 < 10) quickFixes.push("Increase low curve (≤1 CMC) to improve early plays.");
      if (b2 < 8) quickFixes.push("Add a couple more 2-drops for consistent curve.");
    }
  }

  const note =
    draw < 6 ? "needs a touch more draw" : lands < landTarget - 2 ? "mana base is light" : "solid, room to tune";

  // Meta inclusion hints: annotate cards that are popular across commanders
  let metaHints: Array<{ card: string; inclusion_rate: string; commanders: string[] }> = [];

  // --- NEW: Token needs summary (naive oracle scan for common tokens) ---
  const tokenNames = ['Treasure','Clue','Food','Soldier','Zombie','Goblin','Saproling','Spirit','Thopter','Angel','Dragon','Vampire','Eldrazi','Golem','Cat','Beast','Faerie','Plant','Insect'];
  const tokenNeedsSet = new Set<string>();
  try {
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      const o = (c?.oracle_text || '').toString();
      if (/create/i.test(o) && /token/i.test(o)) {
        for (const t of tokenNames) { if (new RegExp(`\n|\b${t}\b`, 'i').test(o)) tokenNeedsSet.add(t); }
      }
    }
  } catch {}
  const tokenNeeds = Array.from(tokenNeedsSet).sort();
  try {
    const metaPath = path.resolve(process.cwd(), "AI research (2)", "AI research", "commander_metagame.json");
    const buf = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(buf);
    if (Array.isArray(meta)) {
      const inclMap = new Map<string, { rate: string; commanders: Set<string> }>();
      for (const entry of meta) {
        const commander = String(entry?.commander_name || "");
        for (const tc of (entry?.top_cards || []) as any[]) {
          const name = String(tc?.card_name || "");
          const rate = String(tc?.inclusion_rate || "");
          if (!name) continue;
          const key = name.toLowerCase();
          const cur = inclMap.get(key) || { rate, commanders: new Set<string>() };
          // keep the highest-looking rate if different
          const curNum = parseFloat((cur.rate || "0").replace(/[^0-9.]/g, "")) || 0;
          const newNum = parseFloat((rate || "0").replace(/[^0-9.]/g, "")) || 0;
          if (newNum > curNum) cur.rate = rate;
          cur.commanders.add(commander);
          inclMap.set(key, cur);
        }
      }
      // Gather for cards in this deck
      for (const { name } of entries) {
        const m = inclMap.get(name.toLowerCase());
        if (m) metaHints.push({ card: name, inclusion_rate: m.rate, commanders: Array.from(m.commanders).slice(0, 3) });
      }
    }
  } catch {}

  return Response.json({
    score,
    note,
    bands,
    curveBuckets, // <= NEW
    counts: { lands, ramp, draw, removal }, // <= NEW: raw category counts for presets
    whatsGood: whatsGood.length ? whatsGood : ["Core plan looks coherent."],
    quickFixes: plan === "Budget" ? quickFixes.map((s) => s.replace("Beast Whisperer", "Guardian Project")) : quickFixes,
    illegalByCI,
    illegalExamples,
    bannedCount,
    bannedExamples,
    tokenNeeds,
    metaHints,
  });
}
