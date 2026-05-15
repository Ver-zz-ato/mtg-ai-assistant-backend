import assert from "node:assert/strict";
import { precheckFixLegalitySourceDeck } from "@/lib/deck/transform-legality-check";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

type FakeRow = { legalities?: Record<string, string>; color_identity?: string[] | null };

function makeDeckMap(rows: Record<string, FakeRow>): Map<string, FakeRow> {
  return new Map(
    Object.entries(rows).map(([name, row]) => [normalizeScryfallCacheName(name), row]),
  );
}

function commanderDeckText(commander: string, cardNames: string[]): string {
  return ["Commander", `1 ${commander}`, ...cardNames.map((name) => `1 ${name}`)].join("\n");
}

function filterRowsByLegalities(
  rows: Array<{ name: string; qty: number }>,
  userFormat: string,
  opts?: { getDetailsForNamesCachedOverride?: (names: string[]) => Promise<Map<string, FakeRow>> },
) {
  const formatKey = String(userFormat || "").trim().toLowerCase();
  return (async () => {
    const details = (await opts?.getDetailsForNamesCachedOverride?.(rows.map((row) => row.name))) ?? new Map<string, FakeRow>();
    const kept: Array<{ name: string; qty: number }> = [];
    const removed: Array<{ name: string; reason: string }> = [];
    for (const row of rows) {
      const detail = details.get(normalizeScryfallCacheName(row.name));
      const status = detail?.legalities?.[formatKey];
      if (status === "legal") kept.push(row);
      else removed.push({ name: row.name, reason: status === "banned" ? "banned" : "not_legal" });
    }
    return { lines: kept, removed };
  })();
}

async function main() {
  {
    const commander = "My Commander";
    const cards = Array.from({ length: 99 }, (_, i) => `Card ${i + 1}`);
    const details = makeDeckMap({
      [commander]: { legalities: { commander: "legal" }, color_identity: ["W"] },
      ...Object.fromEntries(cards.map((name) => [name, { legalities: { commander: "legal" }, color_identity: ["W"] }])),
    });

    const result = await precheckFixLegalitySourceDeck(
      {
        sourceDeckText: commanderDeckText(commander, cards),
        format: "Commander",
        commander,
      },
      {
        getCommanderColors: async () => ["W"],
        getCardDetails: async () => details,
        filterRowsForFormat: filterRowsByLegalities,
        warnOffColor: async () => null,
      },
    );

    assert.ok(result);
    assert.equal(result?.alreadyLegal, true, "legal Commander deck should no-op");
    assert.equal(result?.commanderName, commander);
    assert.equal(result?.validatedRows.length, 100);
    assert.deepEqual(result?.warnings, []);
  }

  {
    const commander = "My Commander";
    const cards = Array.from({ length: 97 }, (_, i) => `Card ${i + 1}`);
    const details = makeDeckMap({
      [commander]: { legalities: { commander: "legal" }, color_identity: ["U"] },
      "Sol Ring": { legalities: { commander: "legal" }, color_identity: [] },
      ...Object.fromEntries(cards.map((name) => [name, { legalities: { commander: "legal" }, color_identity: ["U"] }])),
    });
    const deckText = ["Commander", `1 ${commander}`, "2 Sol Ring", ...cards.map((name) => `1 ${name}`)].join("\n");

    const result = await precheckFixLegalitySourceDeck(
      { sourceDeckText: deckText, format: "Commander", commander },
      {
        getCommanderColors: async () => ["U"],
        getCardDetails: async () => details,
        filterRowsForFormat: filterRowsByLegalities,
        warnOffColor: async () => null,
      },
    );

    assert.ok(result);
    assert.equal(result?.alreadyLegal, false, "duplicate nonbasic should fail Commander singleton check");
    assert.match(result?.warnings.join("\n") ?? "", /copy-count violation/i);
  }

  {
    const commander = "Green Commander";
    const cards = Array.from({ length: 98 }, (_, i) => `Card ${i + 1}`);
    const details = makeDeckMap({
      [commander]: { legalities: { commander: "legal" }, color_identity: ["G"] },
      "Lightning Bolt": { legalities: { commander: "legal" }, color_identity: ["R"] },
      ...Object.fromEntries(cards.map((name) => [name, { legalities: { commander: "legal" }, color_identity: ["G"] }])),
    });
    const deckText = commanderDeckText(commander, [...cards, "Lightning Bolt"]);

    const result = await precheckFixLegalitySourceDeck(
      { sourceDeckText: deckText, format: "Commander", commander },
      {
        getCommanderColors: async () => ["G"],
        getCardDetails: async () => details,
        filterRowsForFormat: filterRowsByLegalities,
        warnOffColor: async () => null,
      },
    );

    assert.ok(result);
    assert.equal(result?.alreadyLegal, false, "off-color card should force a legality repair path");
    assert.match(result?.warnings.join("\n") ?? "", /outside commander color identity/i);
    assert.equal(result?.validatedRows.some((row) => row.name === "Lightning Bolt"), false);
  }

  {
    const cards = Array.from({ length: 60 }, (_, i) => `Standard Card ${i + 1}`);
    const details = makeDeckMap(
      Object.fromEntries(cards.map((name) => [name, { legalities: { standard: "legal" } }])),
    );
    const deckText = cards.map((name) => `1 ${name}`).join("\n");

    const result = await precheckFixLegalitySourceDeck(
      { sourceDeckText: deckText, format: "Standard" },
      {
        getCardDetails: async () => details,
        filterRowsForFormat: filterRowsByLegalities,
        warnOffColor: async () => null,
      },
    );

    assert.ok(result);
    assert.equal(result?.alreadyLegal, true, "legal 60-card deck should no-op too");
    assert.equal(result?.validatedRows.length, 60);
  }

  console.log("transform-legality-check: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
