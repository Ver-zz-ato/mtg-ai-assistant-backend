import assert from "node:assert/strict";
import { assessWorkshopSourceDeck, sourceDeckNeedsLegalityFirst } from "@/lib/deck/workshop-source-assessment";

async function main() {
  const cleanModern = await assessWorkshopSourceDeck({
    sourceDeckText: [
      "4 Monastery Swiftspear",
      "4 Lightning Bolt",
      "18 Mountain",
      "4 Sunbaked Canyon",
      "4 Inspiring Vantage",
      "2 Sacred Foundry",
      "4 Boros Charm",
      "4 Eidolon of the Great Revel",
      "4 Lava Spike",
      "4 Skewer the Critics",
      "4 Rift Bolt",
      "4 Roiling Vortex",
    ].join("\n"),
    format: "Modern",
    commander: null,
  });

  assert.equal(cleanModern.severity, "ok");
  assert.equal(cleanModern.expectedLegality, "noop");

  const shortCommander = await assessWorkshopSourceDeck({
    sourceDeckText: ["1 Teysa, Orzhov Scion", ...Array.from({ length: 40 }, () => "1 Plains")].join("\n"),
    format: "Commander",
    commander: "Teysa, Orzhov Scion",
  });

  assert.ok(Math.abs(shortCommander.issueSummary.sourceCount - shortCommander.issueSummary.targetCount) > 5);
  assert.equal(shortCommander.severity, "blocked");
  assert.equal(shortCommander.suggestFixLegalityFirst, true);

  assert.equal(
    sourceDeckNeedsLegalityFirst({
      sourceRows: [{ name: "Forest", qty: 50 }],
      targetCount: 100,
      isCommander: true,
      precheck: null,
    }),
    true,
  );

  assert.equal(
    sourceDeckNeedsLegalityFirst({
      sourceRows: [
        { name: "Monastery Swiftspear", qty: 4 },
        { name: "Lightning Bolt", qty: 4 },
        { name: "Mountain", qty: 22 },
        { name: "Boros Charm", qty: 30 },
      ],
      targetCount: 60,
      isCommander: false,
      precheck: null,
    }),
    false,
  );

  console.log("workshop-source-assessment tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
