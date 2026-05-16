import { parseDeckText } from "@/lib/deck/parseDeckText";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { tagCards } from "@/lib/deck/card-role-tags";
import { buildDeckFacts } from "@/lib/deck/deck-facts";

export type CompareDeckGrounding = {
  label: string;
  commander: string | null;
  format: string;
  cardCount: number;
  speed: "fast" | "medium" | "slow";
  resilience: number;
  interactionDensity: number;
  drawDensity: number;
  rampDensity: number;
  finisherDensity: number;
  manaStability: number;
  archetypes: string[];
  summary: string;
};

export type DeterministicComparisonMatrix = {
  fasterDeck: string;
  resilientDeck: string;
  lateGameDeck: string;
  recoveryDeck: string;
  explosiveDeck: string;
  interactionDeck: string;
  verdict: string;
};

function cleanLine(line: string): string {
  return line.replace(/\r/g, "").trim();
}

function fallbackDeckEntries(raw: string): Array<{ name: string; qty: number }> {
  return String(raw || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line && !/^(deck|sideboard|maybeboard|commander)\b[:\s]*/i.test(line))
    .map((line) => {
      const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      return {
        name: (match ? match[2] : line).trim(),
        qty: match ? Math.max(1, Number(match[1]) || 1) : 1,
      };
    })
    .filter((row) => row.name.length > 1);
}

function countTagged(tags: string[], wanted: string[]): boolean {
  return wanted.some((tag) => tags.includes(tag));
}

function inferArchetypesFromTags(tagged: ReturnType<typeof tagCards>): string[] {
  const counts = new Map<string, number>();
  for (const card of tagged) {
    for (const tag of card.tags.map((entry) => entry.tag)) {
      if (!["tokens", "graveyard", "artifacts", "enchantments", "spellslinger", "blink", "landfall", "tribal", "lifegain", "sacrifice", "reanimator"].includes(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + (card.qty || 1));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([tag]) => tag);
}

export function splitComparedDeckBlocks(raw: string): Array<{ label: string; deckText: string }> {
  const text = String(raw || "").trim();
  if (!text) return [];
  const sections = text.split(/(?=^Deck [A-C][^\n]*:)/gim).map((chunk) => chunk.trim()).filter(Boolean);
  if (sections.length >= 2) {
    return sections.map((section, index) => {
      const lines = section.split(/\n/);
      const header = cleanLine(lines[0] || "") || `Deck ${String.fromCharCode(65 + index)}`;
      const deckText = lines.slice(1).join("\n").trim();
      return {
        label: header.replace(/:$/, ""),
        deckText,
      };
    }).filter((entry) => entry.deckText.length > 0);
  }
  return [{ label: "Deck A", deckText: text }];
}

function scoreBand(value: number, low: number, high: number): "fast" | "medium" | "slow" {
  if (value <= low) return "fast";
  if (value >= high) return "slow";
  return "medium";
}

function winnerBy<T extends number | string>(
  entries: CompareDeckGrounding[],
  pick: (deck: CompareDeckGrounding) => T,
  direction: "max" | "min" = "max",
): string {
  const sorted = [...entries].sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    if (av === bv) return a.label.localeCompare(b.label);
    if (direction === "max") return Number(bv) - Number(av);
    return Number(av) - Number(bv);
  });
  return sorted[0]?.label || "Deck A";
}

export async function buildDeckCompareGrounding(
  decksRaw: string,
  formatLabel: string,
): Promise<{ decks: CompareDeckGrounding[]; matrix: DeterministicComparisonMatrix }> {
  const blocks = splitComparedDeckBlocks(decksRaw).slice(0, 3);
  const decks: CompareDeckGrounding[] = [];

  for (const [index, block] of blocks.entries()) {
    const parsed = parseDeckText(block.deckText);
    const entries = parsed.length >= 20 ? parsed : fallbackDeckEntries(block.deckText);
    const enriched = await enrichDeck(entries.map((row) => ({ name: row.name, qty: row.qty })), {
      format: (formatLabel as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper") || "Commander",
      commander: null,
    }).catch(() => []);
    const tagged = tagCards(enriched);
    const facts = buildDeckFacts(tagged, {
      format: (formatLabel as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper") || "Commander",
      commander: null,
    });
    const totalCards = Math.max(1, entries.reduce((sum, row) => sum + (row.qty || 0), 0));
    const lands = facts.land_count ?? tagged.filter((card) => card.is_land).reduce((sum, card) => sum + (card.qty || 0), 0);
    const totalNonLand = Math.max(1, totalCards - lands);
    const ramp = tagged.filter((card) => countTagged(card.tags.map((entry) => entry.tag), ["ramp", "land_ramp", "ramp_land", "mana_rock", "ramp_rocks"])).reduce((sum, card) => sum + (card.qty || 0), 0);
    const draw = tagged.filter((card) => countTagged(card.tags.map((entry) => entry.tag), ["draw", "card_draw", "repeatable_draw", "draw_repeatable", "draw_burst"])).reduce((sum, card) => sum + (card.qty || 0), 0);
    const removal = tagged.filter((card) => countTagged(card.tags.map((entry) => entry.tag), ["interaction", "removal", "spot_removal", "board_wipe", "counterspell", "removal_single", "removal_boardwipe"])).reduce((sum, card) => sum + (card.qty || 0), 0);
    const wincons = tagged.filter((card) => countTagged(card.tags.map((entry) => entry.tag), ["finisher", "payoff"])).reduce((sum, card) => sum + (card.qty || 0), 0);
    const curveTop = facts.curve_histogram?.[4] ?? 0;
    const speedScore = ((facts.curve_histogram?.[0] ?? 0) + (facts.curve_histogram?.[1] ?? 0) + ramp) - curveTop;
    const resilience = draw + Math.max(0, removal - 2) + Math.max(0, wincons - 1);
    const manaStability = lands + ramp;
    const archetypes = facts.archetype_candidates.length
      ? facts.archetype_candidates.slice(0, 2).map((entry) => entry.name)
      : inferArchetypesFromTags(tagged);

    decks.push({
      label: block.label || `Deck ${String.fromCharCode(65 + index)}`,
      commander: facts.commander ?? null,
      format: formatLabel,
      cardCount: totalCards,
      speed: scoreBand(speedScore, 10, 18),
      resilience,
      interactionDensity: Math.round((removal / totalNonLand) * 100),
      drawDensity: Math.round((draw / totalNonLand) * 100),
      rampDensity: Math.round((ramp / totalNonLand) * 100),
      finisherDensity: Math.round((wincons / totalNonLand) * 100),
      manaStability,
      archetypes,
      summary: [
        `ramp ${ramp}`,
        `draw ${draw}`,
        `interaction ${removal}`,
        `wincons ${wincons}`,
        archetypes.length ? `archetypes ${archetypes.join("/")}` : "",
      ].filter(Boolean).join(" | "),
    });
  }

  const fasterDeck = winnerBy(decks, (deck) => ({ fast: 3, medium: 2, slow: 1 }[deck.speed]), "max");
  const resilientDeck = winnerBy(decks, (deck) => deck.resilience, "max");
  const lateGameDeck = winnerBy(decks, (deck) => deck.finisherDensity + deck.drawDensity, "max");
  const recoveryDeck = winnerBy(decks, (deck) => deck.drawDensity + deck.resilience, "max");
  const explosiveDeck = winnerBy(decks, (deck) => deck.rampDensity + ({ fast: 5, medium: 2, slow: 0 }[deck.speed]), "max");
  const interactionDeck = winnerBy(decks, (deck) => deck.interactionDensity, "max");

  const matrix: DeterministicComparisonMatrix = {
    fasterDeck,
    resilientDeck,
    lateGameDeck,
    recoveryDeck,
    explosiveDeck,
    interactionDeck,
    verdict: `${fasterDeck} looks quicker, while ${lateGameDeck} has the stronger long-game plan.`,
  };

  return { decks, matrix };
}
