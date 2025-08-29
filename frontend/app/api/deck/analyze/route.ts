// frontend/app/api/deck/analyze/route.ts
// Heuristic deck snapshot + logging.

export async function POST(req: Request) {
  const started = Date.now();
  console.log("[api/deck/analyze] POST start");

  const { deckText = "" } = await req.json().catch(() => ({ deckText: "" }));

  const lines: string[] = deckText
    .split(/\r?\n/)
    .map((s: string) => s.trim())
    .filter((s: string) => Boolean(s));

  // super-light heuristics
  const total = lines.length;
  const landRx =
    /\b(Island|Swamp|Plains|Forest|Mountain|Gate|Temple|Land)\b/i;
  const drawRx =
    /\b(Draw|Opt|Ponder|Brainstorm|Read the Bones|Sign in Blood|Beast Whisperer|Inspiring Call)\b/i;
  const rampRx =
    /\b(Rampant Growth|Cultivate|Kodama's|Solemn|Signet|Talisman|Sol Ring|Arcane Signet)\b/i;
  const removalRx =
    /\b(Removal|Swords to Plowshares|Path to Exile|Terminate|Go for the Throat|Beast Within)\b/i;

  const lands   = lines.filter((l: string) => landRx.test(l)).length;
  const draw    = lines.filter((l: string) => drawRx.test(l)).length;
  const ramp    = lines.filter((l: string) => rampRx.test(l)).length;
  const removal = lines.filter((l: string) => removalRx.test(l)).length;

  // crude band scores 0..1
  const bands = {
    curve: Math.min(1, Math.max(0.5, 0.8 - Math.max(0, total - 100) * 0.001)),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.2),
    mana: Math.min(1, lands >= 34 ? 0.8 : lands >= 30 ? 0.7 : 0.55),
  };

  const score = Math.round(
    (bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20
  );

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  if (lands >= 34) whatsGood.push("Mana base looks stable for Commander.");
  else quickFixes.push("Add 2–3 lands (aim 34–36 for EDH).");

  if (ramp >= 8) whatsGood.push("Healthy ramp density.");
  else quickFixes.push(
    "Add 2 cheap rocks: <em>Arcane Signet</em>, <em>Fellwar Stone</em>."
  );

  if (draw >= 8) whatsGood.push("Card draw density looks fine.");
  else quickFixes.push(
    "Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>."
  );

  if (removal < 5)
    quickFixes.push(
      "Add 1–2 interaction pieces: <em>Swords to Plowshares</em>, <em>Path to Exile</em>."
    );

  const note =
    draw < 6
      ? "needs a touch more draw"
      : lands < 32
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
    quickFixes: quickFixes.length ? quickFixes : ["Tweak flex slots to taste."],
  });
}
