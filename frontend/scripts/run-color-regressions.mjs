import fs from "node:fs";

const TEST_ENDPOINT = "https://www.manatap.ai/api/deck/analyze";
const SCRYFALL_ENDPOINT = "https://api.scryfall.com/cards/named?exact=";

const BASE_TESTS = [
  {
    name: "Mono-White Lifegain (W)",
    colors: ["W"],
    deckText: `1 Heliod, Sun-Crowned
1 Plains
1 Land Tax
1 Path to Exile
1 Smothering Tithe
1 Archangel of Thune`,
  },
  {
    name: "Mono-Blue Control (U)",
    colors: ["U"],
    deckText: `1 Talrand, Sky Summoner
1 Island
1 Counterspell
1 Ponder
1 Cyclonic Rift
1 Mystic Remora`,
  },
  {
    name: "Mono-Black Aristocrats (B)",
    colors: ["B"],
    deckText: `1 Ayara, First of Locthwain
1 Swamp
1 Thoughtseize
1 Phyrexian Arena
1 Gray Merchant of Asphodel
1 Village Rites`,
  },
  {
    name: "Mono-Red Aggro (R)",
    colors: ["R"],
    deckText: `1 Torbran, Thane of Red Fell
1 Mountain
1 Lightning Bolt
1 Jeska's Will
1 Anje's Ravager
1 Chandra, Torch of Defiance`,
  },
  {
    name: "Mono-Green Ramp (G)",
    colors: ["G"],
    deckText: `1 Selvala, Heart of the Wilds
1 Forest
1 Cultivate
1 Garruk's Uprising
1 Beast Whisperer
1 End-Raze Forerunners`,
  },
  {
    name: "Azorius Flyers (W/U)",
    colors: ["W", "U"],
    deckText: `1 Brago, King Eternal
1 Plains
1 Island
1 Supreme Verdict
1 Teferi, Time Raveler
1 Skycat Sovereign`,
  },
  {
    name: "Dimir Rogues (U/B)",
    colors: ["U", "B"],
    deckText: `1 Anowon, the Ruin Thief
1 Island
1 Swamp
1 Into the Story
1 Drown in the Loch
1 Soaring Thought-Thief`,
  },
  {
    name: "Rakdos Sacrifice (B/R)",
    colors: ["B", "R"],
    deckText: `1 Anje Falkenrath
1 Mountain
1 Swamp
1 Mayhem Devil
1 Bedevil
1 Night's Whisper`,
  },
  {
    name: "Gruul Stompy (R/G)",
    colors: ["R", "G"],
    deckText: `1 Xenagos, God of Revels
1 Mountain
1 Forest
1 Harmonize
1 Chaos Warp
1 Terror of the Peaks`,
  },
  {
    name: "Selesnya Tokens (G/W)",
    colors: ["G", "W"],
    deckText: `1 Trostani, Selesnya's Voice
1 Forest
1 Plains
1 Parallel Lives
1 March of the Multitudes
1 Aura Shards`,
  },
  {
    name: "Izzet Spells (U/R)",
    colors: ["U", "R"],
    deckText: `1 Veyran, Voice of Duality
1 Island
1 Mountain
1 Expressive Iteration
1 Storm-Kiln Artist
1 Reality Shift`,
  },
  {
    name: "Orzhov Lifedrain (W/B)",
    colors: ["W", "B"],
    deckText: `1 Teysa Karlov
1 Plains
1 Swamp
1 Vindicate
1 Skrelv's Hive
1 Cruel Celebrant`,
  },
  {
    name: "Golgari Graveyard (B/G)",
    colors: ["B", "G"],
    deckText: `1 Meren of Clan Nel Toth
1 Swamp
1 Forest
1 Grisly Salvage
1 Binding the Old Gods
1 Eternal Witness`,
  },
  {
    name: "Boros Equipment (R/W)",
    colors: ["R", "W"],
    deckText: `1 Wyleth, Soul of Steel
1 Mountain
1 Plains
1 Sword of the Animist
1 Boros Charm
1 Sevinne's Reclamation`,
  },
  {
    name: "Simic Ramp (G/U)",
    colors: ["G", "U"],
    deckText: `1 Tatyova, Benthic Druid
1 Island
1 Forest
1 Growth Spiral
1 Koma, Cosmos Serpent
1 Mystic Snake`,
  },
];

const EXTRA_TESTS = [
  {
    name: "Bant Enchantments (G/W/U)",
    colors: ["G", "W", "U"],
    deckText: `1 Tuvasa the Sunlit
1 Temple Garden
1 Breeding Pool
1 Hallowed Fountain
1 Sterling Grove
1 Estrid's Invocation`,
  },
  {
    name: "Esper Control (W/U/B)",
    colors: ["W", "U", "B"],
    deckText: `1 Oloro, Ageless Ascetic
1 Watery Grave
1 Godless Shrine
1 Supreme Verdict
1 Teferi, Hero of Dominaria
1 Esper Sentinel`,
  },
  {
    name: "Grixis Wheels (U/B/R)",
    colors: ["U", "B", "R"],
    deckText: `1 Nekusar, the Mindrazer
1 Steam Vents
1 Blood Crypt
1 Wheel of Fortune
1 Windfall
1 Notion Thief`,
  },
  {
    name: "Jund Sacrifice (B/R/G)",
    colors: ["B", "R", "G"],
    deckText: `1 Korvold, Fae-Cursed King
1 Stomping Ground
1 Overgrown Tomb
1 Dockside Extortionist
1 Fecundity
1 Assassin's Trophy`,
  },
  {
    name: "Naya Tokens (R/G/W)",
    colors: ["R", "G", "W"],
    deckText: `1 Ghired, Conclave Exile
1 Sacred Foundry
1 Temple Garden
1 Parallel Lives
1 Beastmaster Ascension
1 Lightning Helix`,
  },
  {
    name: "Abzan Counters (W/B/G)",
    colors: ["W", "B", "G"],
    deckText: `1 Tayam, Luminous Enigma
1 Godless Shrine
1 Overgrown Tomb
1 Anafenza, the Foremost
1 Bloom Tender
1 Mortify`,
  },
  {
    name: "Jeskai Spellslinger (U/R/W)",
    colors: ["U", "R", "W"],
    deckText: `1 Elsha of the Infinite
1 Steam Vents
1 Prairie Stream
1 Deflecting Palm
1 Jeskai Ascendancy
1 Expressive Iteration`,
  },
  {
    name: "Mardu Aristocrats (W/B/R)",
    colors: ["W", "B", "R"],
    deckText: `1 Alesha, Who Smiles at Death
1 Godless Shrine
1 Blood Crypt
1 Faithless Looting
1 Vindicate
1 Bishop of Wings`,
  },
  {
    name: "Sultai Graveyard (U/B/G)",
    colors: ["U", "B", "G"],
    deckText: `1 Muldrotha, the Gravetide
1 Watery Grave
1 Breeding Pool
1 Life from the Loam
1 Eternal Witness
1 Putrefy`,
  },
  {
    name: "Temur Creatures (U/R/G)",
    colors: ["U", "R", "G"],
    deckText: `1 Animar, Soul of Elements
1 Steam Vents
1 Stomping Ground
1 Rishkar's Expertise
1 Beast Within
1 Curse of the Swine`,
  },
  {
    name: "Breya Artifacts (W/U/B/R)",
    colors: ["W", "U", "B", "R"],
    deckText: `1 Breya, Etherium Shaper
1 Arcane Signet
1 Command Tower
1 Darksteel Forge
1 Saheeli, Sublime Artificer
1 Sphinx of the Steel Wind`,
  },
  {
    name: "Atraxa Superfriends (W/U/B/G)",
    colors: ["W", "U", "B", "G"],
    deckText: `1 Atraxa, Praetors' Voice
1 Temple Garden
1 Watery Grave
1 Teferi, Temporal Archmage
1 Deepglow Skate
1 Anguished Unmaking`,
  },
  {
    name: "Saskia Aggro (W/B/R/G)",
    colors: ["W", "B", "R", "G"],
    deckText: `1 Saskia the Unyielding
1 Blood Crypt
1 Stomping Ground
1 Lightning Greaves
1 Hero's Downfall
1 Seasoned Pyromancer`,
  },
  {
    name: "Kynaios Group Hug (W/U/R/G)",
    colors: ["W", "U", "R", "G"],
    deckText: `1 Kynaios and Tiro of Meletis
1 Temple Garden
1 Steam Vents
1 Rites of Flourishing
1 Collective Voyage
1 Beast Within`,
  },
  {
    name: "Yidris Cascade (U/B/R/G)",
    colors: ["U", "B", "R", "G"],
    deckText: `1 Yidris, Maelstrom Wielder
1 Steam Vents
1 Overgrown Tomb
1 Maelstrom Wanderer
1 Baleful Strix
1 Decimate`,
  },
  {
    name: "Jodah Legends (W/U/B/R/G)",
    colors: ["W", "U", "B", "R", "G"],
    deckText: `1 Jodah, Archmage Eternal
1 Command Tower
1 City of Brass
1 Mirari's Wake
1 Time Warp
1 Growth Spiral`,
  },
  {
    name: "Kenrith Toolbox (W/U/B/R/G)",
    colors: ["W", "U", "B", "R", "G"],
    deckText: `1 Kenrith, the Returned King
1 Reflecting Pool
1 Exotic Orchard
1 Smothering Tithe
1 Cyclonic Rift
1 Beast Within`,
  },
  {
    name: "Ur-Dragon Tribal (W/U/B/R/G)",
    colors: ["W", "U", "B", "R", "G"],
    deckText: `1 The Ur-Dragon
1 Savage Ventmaw
1 Scion of the Ur-Dragon
1 Crux of Fate
1 Rhythm of the Wild
1 Chromatic Lantern`,
  },
  {
    name: "Najeela Warriors (W/U/B/R/G)",
    colors: ["W", "U", "B", "R", "G"],
    deckText: `1 Najeela, the Blade-Blossom
1 City of Brass
1 Reflecting Pool
1 Derevi, Empyrial Tactician
1 Nature's Will
1 Patriarch's Bidding`,
  },
  {
    name: "Ramos Storm (W/U/B/R/G)",
    colors: ["W", "U", "B", "R", "G"],
    deckText: `1 Ramos, Dragon Engine
1 Chromatic Lantern
1 Farseek
1 Jeska's Will
1 Time Spiral
1 Merciless Eviction`,
  },
  {
    name: "Partners Thrasios & Vial Smasher (G/U/B/R)",
    colors: ["G", "U", "B", "R"],
    deckText: `1 Thrasios, Triton Hero
1 Vial Smasher the Fierce
1 Morphic Pool
1 Spire Garden
1 Fierce Guardianship
1 Abrupt Decay`,
  },
  {
    name: "Partners Tymna & Kraum (W/U/B/R)",
    colors: ["W", "U", "B", "R"],
    deckText: `1 Tymna the Weaver
1 Kraum, Ludevic's Opus
1 Sacred Foundry
1 Watery Grave
1 Ad Nauseam
1 Force of Negation`,
  },
  {
    name: "Partners Ishai & Jeska (W/U/R)",
    colors: ["W", "U", "R"],
    deckText: `1 Ishai, Ojutai Dragonspeaker
1 Jeska, Thrice Reborn
1 Hallowed Fountain
1 Steam Vents
1 Jeskai Ascendancy
1 Swords to Plowshares`,
  },
  {
    name: "Partners Ikra & Silas (U/B/G)",
    colors: ["U", "B", "G"],
    deckText: `1 Ikra Shidiqi, the Usurper
1 Silas Renn, Seeker Adept
1 Zagoth Triome
1 Command Tower
1 Putrefy
1 Mystic Remora`,
  },
  {
    name: "Partners Rograkh & Silas (U/B/R)",
    colors: ["U", "B", "R"],
    deckText: `1 Rograkh, Son of Rohgahh
1 Silas Renn, Seeker Adept
1 Blood Crypt
1 Watery Grave
1 Fierce Guardianship
1 Lightning Bolt`,
  },
  {
    name: "Colorless Eldrazi Ramp",
    colors: [],
    deckText: `1 Kozilek, the Great Distortion
1 Wastes
1 Thought Vessel
1 Forsaken Monument
1 All Is Dust
1 Mind Stone`,
  },
  {
    name: "Colorless Artifacts",
    colors: [],
    deckText: `1 Karn, Silver Golem
1 Ancient Tomb
1 Sol Ring
1 Steel Overseer
1 Walking Ballista
1 Darksteel Citadel`,
  },
  {
    name: "Colorless Aggro",
    colors: [],
    deckText: `1 Traxos, Scourge of Kroog
1 Wastes
1 Thought Monitor
1 Smuggler's Copter
1 Lightning Greaves
1 Scrap Trawler`,
  },
  {
    name: "Colorless Tempo",
    colors: [],
    deckText: `1 Hope of Ghirapur
1 Blinkmoth Nexus
1 Arcbound Ravager
1 Skullclamp
1 Sword of Fire and Ice
1 Retrofitter Foundry`,
  },
  {
    name: "Colorless Control",
    colors: [],
    deckText: `1 Ulamog, the Ceaseless Hunger
1 Eldrazi Temple
1 Mind Stone
1 Oblivion Sower
1 Warping Wail
1 Duplicant`,
  },
];

const TESTS = [...BASE_TESTS, ...EXTRA_TESTS];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scryfallCache = new Map();
async function fetchCardInfo(name) {
  const key = name.toLowerCase();
  if (scryfallCache.has(key)) return scryfallCache.get(key);
  const res = await fetch(`${SCRYFALL_ENDPOINT}${encodeURIComponent(name)}`);
  if (!res.ok) {
    console.warn(`⚠️  Scryfall lookup failed for ${name} (${res.status})`);
    scryfallCache.set(key, null);
    return null;
  }
  const json = await res.json();
  scryfallCache.set(key, json);
  return json;
}

function isCardOnColor(cardJson, allowedColors) {
  if (!cardJson) return false;
  const identity = cardJson.color_identity || [];
  return identity.every((c) => allowedColors.has(c));
}

async function runTest(test, opts) {
  const allowed = new Set(test.colors.map((c) => c.toUpperCase()));
  const body = {
    deckText: test.deckText,
    format: test.format ?? "Commander",
    useScryfall: true,
    useGPT: true,
    plan: test.plan ?? "Optimized",
    colors: test.colors,
    userMessage: test.prompt ?? `${test.name}: ensure all suggestions stay within ${[...allowed].join("/")}.`,
  };

  const res = await fetch(TEST_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      status: "error",
      message: `API returned ${res.status} ${res.statusText}`,
    };
  }

  const json = await res.json();
  const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
  const failures = [];

  for (const suggestion of suggestions) {
    if (!suggestion?.card || suggestion.card === "N/A") continue;
    const cardInfo = await fetchCardInfo(suggestion.card);
    if (!isCardOnColor(cardInfo, allowed)) {
      failures.push({
        card: suggestion.card,
        reason: suggestion.reason,
        color_identity: cardInfo?.color_identity ?? [],
      });
    }
    if (opts.delayMs) await delay(opts.delayMs);
  }

  return {
    status: failures.length ? "fail" : "pass",
    failures,
    rawSuggestions: suggestions,
  };
}

async function main() {
  const results = [];
  for (const test of TESTS) {
    process.stdout.write(`▶ ${test.name} ... `);
    try {
      const result = await runTest(test, { delayMs: 120 });
      results.push({ test, result });
      if (result.status === "pass") {
        console.log("✅ PASS");
      } else if (result.status === "error") {
        console.log("❌ ERROR");
        console.log(`   ${result.message}`);
      } else {
        console.log("❌ FAIL");
        for (const failure of result.failures) {
          console.log(
            `   Off-color suggestion: ${failure.card} (identity: ${failure.color_identity.join(
              ""
            ) || "C"}) — reason: ${failure.reason}`
          );
        }
      }
    } catch (error) {
      console.log("❌ ERROR");
      console.log(`   ${error?.message ?? error}`);
      results.push({ test, result: { status: "error", message: error?.message ?? String(error) } });
    }
    await delay(250);
  }

  const summary = results.reduce(
    (acc, { result }) => {
      if (result.status === "pass") acc.pass += 1;
      else if (result.status === "error") acc.error += 1;
      else acc.fail += 1;
      return acc;
    },
    { pass: 0, fail: 0, error: 0 }
  );

  console.log("\n=== Summary ===");
  console.log(`Pass:  ${summary.pass}`);
  console.log(`Fail:  ${summary.fail}`);
  console.log(`Error: ${summary.error}`);

  const out = results.map(({ test, result }) => ({
    name: test.name,
    colors: test.colors,
    status: result.status,
    failures: result.failures ?? [],
  }));
  fs.writeFileSync(
    "./color-regressions-results.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results: out }, null, 2)
  );
  console.log("\nDetailed results written to color-regressions-results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

