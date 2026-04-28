import assert from "node:assert";
import {
  CONSTRUCTED_SEED_MIN_VALIDATED_QTY,
  getConstructedSeedTemplate,
  validateConstructedSeedTemplate,
  type ConstructedSeedTemplate,
} from "@/lib/deck/generate-constructed-templates";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { padMainboardNearSixty } from "@/lib/deck/generate-constructed-post";
import { totalDeckQty } from "@/lib/deck/generation-helpers";

async function run() {
  {
    const p = getConstructedSeedTemplate({
      format: "Pioneer",
      colors: ["G"],
      archetype: "Ramp",
      budget: "balanced",
    });
    assert.ok(p);
    assert.ok(p!.mainboardSeed.length > 0);
  }

  {
    const s = getConstructedSeedTemplate({
      format: "Standard",
      colors: ["W", "U"],
      archetype: "Control",
      budget: "balanced",
    });
    assert.ok(s);
    assert.ok(s!.notes.some((n) => n.toLowerCase().includes("standard")));
  }

  const legal = {
    legalities: {
      pioneer: "legal",
      modern: "legal",
      standard: "legal",
      pauper: "legal",
    },
  };

  {
    const tpl: ConstructedSeedTemplate = {
      titleHint: "t",
      archetypeHint: "a",
      colorsHint: ["G"],
      mainboardSeed: [{ card: "Definitely Fake Card Zzyzx", qty: 60 }],
      sideboardSeed: [],
      notes: [],
    };
    const v = await validateConstructedSeedTemplate("Pioneer", tpl, {
      getDetailsForNamesCachedOverride: async (names) => {
        const m = new Map();
        for (const n of names) {
          const k = normalizeScryfallCacheName(n);
          if (n.includes("Fake")) m.set(k, null);
          else m.set(k, legal);
        }
        return m as Map<string, unknown>;
      },
    });
    assert.ok(v.removalCount >= 1);
    assert.equal(v.validatedMainQty, 0);
    assert.equal(v.includeCardSeedsInPrompt, false);
  }

  {
    const tpl = getConstructedSeedTemplate({
      format: "Standard",
      colors: ["W", "U"],
      archetype: "Control",
      budget: "balanced",
    });
    assert.ok(tpl);
    const v = await validateConstructedSeedTemplate("Standard", tpl!, {
      getDetailsForNamesCachedOverride: async (names) => {
        const m = new Map();
        for (const n of names) {
          m.set(normalizeScryfallCacheName(n), legal);
        }
        return m as Map<string, unknown>;
      },
    });
    assert.ok(v.validatedMainQty >= CONSTRUCTED_SEED_MIN_VALIDATED_QTY);
  }

  {
    const out = padMainboardNearSixty([{ name: "Mountain", qty: 52 }], ["R"], { minBand: 52 });
    assert.equal(totalDeckQty(out.rows), 60);
  }

  console.log("generate-constructed-templates tests OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
