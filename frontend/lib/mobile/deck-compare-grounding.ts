import { parseDeckText } from "@/lib/deck/parseDeckText";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { tagCards } from "@/lib/deck/card-role-tags";
import { buildDeckFacts } from "@/lib/deck/deck-facts";
import { getServiceRoleClient } from "@/lib/server-supabase";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

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

function cardTextSignals(card: { oracle_text?: string; type_line?: string; mana_cost?: string }): {
  ramp: boolean;
  draw: boolean;
  interaction: boolean;
  finisher: boolean;
} {
  const text = `${String(card.oracle_text || "")} ${String(card.type_line || "")} ${String(card.mana_cost || "")}`.toLowerCase();
  return {
    ramp: /\badd \{[wubrgc]\}|\bsearch your library for (?:a|up to .*?) land\b|\bcreate (?:a|two|three|\w+) treasure token\b|\byou may play an additional land\b|\brampant growth\b/i.test(text),
    draw: /\bdraw (?:a|two|three|\w+) card\b|\bwhenever .* draw a card\b|\bat the beginning of .* draw\b|\binvestigate\b/i.test(text),
    interaction: /\bcounter target\b|\bdestroy target\b|\bexile target\b|\breturn target .* to .* hand\b|\bdeals? \d+ damage to target\b|\ball creatures get -\d/i.test(text),
    finisher: /\bdouble strike\b|\bextra combat\b|\bcreatures you control get \+\d\/\+\d\b|\byou win the game\b|\bfor each creature you control\b|\bwhenever .* attacks\b/i.test(text),
  };
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

async function loadCompareEnrichedEntries(
  entries: Array<{ name: string; qty: number }>,
): Promise<Array<{ name: string; qty: number; type_line?: string; oracle_text?: string; color_identity?: string[]; cmc?: number; mana_cost?: string; legalities?: Record<string, string>; colors?: string[]; keywords?: string[]; is_land?: boolean; is_creature?: boolean }>> {
  const admin = getServiceRoleClient();
  const names = [...new Set(entries.map((row) => normalizeScryfallCacheName(row.name)).filter(Boolean))];
  if (admin && names.length) {
    const { data } = await admin
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, color_identity, cmc, mana_cost, legalities, colors, keywords, is_land, is_creature")
      .in("name", names);
    const byName = new Map<string, any>();
    for (const row of data ?? []) byName.set(normalizeScryfallCacheName(String((row as any).name || "")), row);
    return entries.map((entry) => {
      const row = byName.get(normalizeScryfallCacheName(entry.name));
      return row
        ? {
            name: entry.name,
            qty: entry.qty,
            type_line: row.type_line ?? undefined,
            oracle_text: row.oracle_text ?? undefined,
            color_identity: Array.isArray(row.color_identity) ? row.color_identity : [],
            cmc: typeof row.cmc === "number" ? row.cmc : undefined,
            mana_cost: row.mana_cost ?? undefined,
            legalities: row.legalities ?? {},
            colors: Array.isArray(row.colors) ? row.colors : [],
            keywords: Array.isArray(row.keywords) ? row.keywords : [],
            ...(typeof row.is_land === "boolean" ? { is_land: row.is_land } : {}),
            ...(typeof row.is_creature === "boolean" ? { is_creature: row.is_creature } : {}),
          }
        : { name: entry.name, qty: entry.qty };
    });
  }
  return enrichDeck(entries, {
    format: "Commander",
    commander: null,
  }).catch(() => []);
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
    const enriched = await loadCompareEnrichedEntries(entries.map((row) => ({ name: row.name, qty: row.qty })));
    const tagged = tagCards(enriched);
    const facts = buildDeckFacts(tagged, {
      format: (formatLabel as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper") || "Commander",
      commander: null,
    });
    const totalCards = Math.max(1, entries.reduce((sum, row) => sum + (row.qty || 0), 0));
    const lands = facts.land_count ?? tagged.filter((card) => card.is_land).reduce((sum, card) => sum + (card.qty || 0), 0);
    const uniqueNonLandCards = tagged.filter((card) => !card.is_land);
    const totalNonLand = Math.max(1, uniqueNonLandCards.length);
    const ramp = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.ramp || countTagged(tags, ["ramp_land", "mana_rock", "ramp_rocks"]);
    }).length;
    const draw = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.draw || countTagged(tags, ["card_draw", "repeatable_draw", "draw_repeatable", "draw_burst"]);
    }).length;
    const removal = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.interaction || countTagged(tags, ["interaction", "spot_removal", "board_wipe", "counterspell", "removal_single", "removal_boardwipe"]);
    }).length;
    const wincons = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.finisher || countTagged(tags, ["finisher"]);
    }).length;
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
        `ramp ${Math.round((ramp / totalNonLand) * 100)}%`,
        `draw ${Math.round((draw / totalNonLand) * 100)}%`,
        `interaction ${Math.round((removal / totalNonLand) * 100)}%`,
        `finishers ${Math.round((wincons / totalNonLand) * 100)}%`,
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
