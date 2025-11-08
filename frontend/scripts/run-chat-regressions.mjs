import fs from "node:fs";

const CHAT_ENDPOINT = "https://www.manatap.ai/api/chat";
const AUTH_HEADER = process.env.CHAT_API_TOKEN
  ? { authorization: `Bearer ${process.env.CHAT_API_TOKEN}` }
  : {};

/**
 * Suite definitions
 *
 * Each suite contains:
 * - id: unique identifier
 * - title: human readable label
 * - prompts: array of { name, text, expect }
 *   where expect describes pass/fail heuristics in regex rules.
 */

const SUITES = [
  {
    id: "format",
    title: "Format & Deck Structure Inference",
    prompts: [
      {
        name: "Atraxa Commander",
        text: "Here’s my 100-card deck with Atraxa at the helm — tell me what it’s missing.",
        expect: {
          mustMatch: [/commander/i, /(100|hundred)/i],
          mustNotMatch: [/standard/i],
        },
      },
      {
        name: "Modern Burn Curve",
        text: "This is a 60-card mono-red burn list for Modern — what’s the curve like?",
        expect: {
          mustMatch: [/modern/i, /60[- ]?card/i, /curve/i],
          mustNotMatch: [/commander/i],
        },
      },
      {
        name: "EDH Trim",
        text: "I have 102 cards in my EDH deck, what should I cut?",
        expect: {
          mustMatch: [/100[- ]?card/i, /(cut|trim)/i],
        },
      },
      {
        name: "Standard Legality Check",
        text: "Is this legal in Standard right now? (Assume the list includes older cards)",
        expect: {
          mustMatch: [/standard/i, /(rotation|legal|not.*legal)/i],
        },
      },
      {
        name: "Sol Ring Question",
        text: "Can I run Sol Ring in this?",
        expect: {
          mustMatch: [/(commander|edh)/i],
          mustNotMatch: [/sure.*modern/i],
        },
      },
      {
        name: "Brawl vs Commander",
        text: "This is Brawl, not Commander — what’s wrong with it?",
        expect: {
          mustMatch: [/brawl/i, /(60|59)/],
        },
      },
      {
        name: "Pauper EDH Rarities",
        text: "My deck is Pauper EDH, can you flag non-common cards?",
        expect: {
          mustMatch: [/pauper/i, /(common|rarit)/i],
        },
      },
      {
        name: "Modern with Mana Crypt",
        text: "I want this to be Modern but I have Mana Crypt.",
        expect: {
          mustMatch: [/not.*modern/i],
        },
      },
      {
        name: "Historic Singletons",
        text: "This is Historic on Arena — do I have too many 1-ofs?",
        expect: {
          mustMatch: [/historic/i, /(arena|best of one|bo1)/i],
        },
      },
      {
        name: "Format Guess",
        text: "Can you tell if this is Commander or just a pile?",
        expect: {
          mustMatch: [/commander|60[- ]?card/i],
        },
      },
    ],
  },
  {
    id: "pillars",
    title: "Commander Pillars (Ramp/Draw/Removal/Wincon)",
    prompts: [
      {
        name: "Audit Pillars",
        text: "Can you audit this Commander deck for ramp / draw / removal?",
        expect: {
          mustMatch: [/ramp/i, /draw/i, /removal/i],
        },
      },
      {
        name: "Land Count",
        text: "Does this deck have enough lands for EDH or am I being greedy?",
        expect: {
          mustMatch: [/lands?/i, /(35|36|37|38|39|40)/],
        },
      },
      {
        name: "Close the Game",
        text: "Tell me if I have ways to actually close the game, not just value.",
        expect: {
          mustMatch: [/(win condition|finish|closer)/i],
        },
      },
      {
        name: "Dead Cards",
        text: "Can you point out dead cards in multiplayer?",
        expect: {
          mustMatch: [/dead card/i],
        },
      },
      {
        name: "Card Advantage Adds",
        text: "What are 3 cards I can add to improve card advantage?",
        expect: {
          mustMatch: [/card advantage/i, /\[\[[^\]]+\]\]/],
        },
      },
      {
        name: "Cut Off-plan",
        text: "What would you cut that doesn’t match the commander’s plan?",
        expect: {
          mustMatch: [/(cut|replace)/i],
        },
      },
      {
        name: "Enough Interaction",
        text: "Does this list have enough interaction for a casual pod?",
        expect: {
          mustMatch: [/interaction/i, /(removal|answer)/i],
        },
      },
      {
        name: "Board Wipe Adjustments",
        text: "If this pod runs board wipes a lot, what should I adjust?",
        expect: {
          mustMatch: [/(board wipe|wipe)/i, /(rebuild|protection|indestructible)/i],
        },
      },
      {
        name: "Six Drop Density",
        text: "Am I too high on 6-drops for EDH?",
        expect: {
          mustMatch: [/(six|6)[- ]?drop/i, /(curve|avg)/i],
        },
      },
      {
        name: "Plan Summary",
        text: "Explain what this deck is trying to do, in one paragraph.",
        expect: {
          mustMatch: [/(plan|game plan|strategy)/i],
        },
      },
    ],
  },
  {
    id: "budget",
    title: "Budget-Aware Suggestions",
    prompts: [
      {
        name: "Selesnya Budget Cap",
        text: "Make this Selesnya tokens deck under $80 without ruining it.",
        expect: {
          mustMatch: [/\$?80/i, /(budget|cheap)/i],
          mustNotMatch: [/\$?(?:50|100|200)[0-9]/i, /mana crypt/i],
        },
      },
      {
        name: "Precon GBP Upgrades",
        text: "This precon is £35 — upgrades under £10 total?",
        expect: {
          mustMatch: [/£?10/i, /(upgrade|swap)/i],
          mustNotMatch: [/dockside/i],
        },
      },
      {
        name: "Smothering Tithe Alt",
        text: "Suggest a cheaper version of Smothering Tithe for casual Commander.",
        expect: {
          mustMatch: [/cheaper/i, /smothering tithe/i],
          mustNotMatch: [/dockside/i],
        },
      },
      {
        name: "Shockland Alternatives",
        text: "I can’t afford shocklands — what’s the next tier?",
        expect: {
          mustMatch: [/shockland/i, /(budget|cheap)/i],
        },
      },
      {
        name: "Draw Under 150",
        text: "Keep this list under $150 but improve card draw.",
        expect: {
          mustMatch: [/150/i, /(card draw|draw)/i],
          mustNotMatch: [/mana crypt/i],
        },
      },
      {
        name: "Budget Graveyard Hate",
        text: "Give me budget graveyard hate options for EDH.",
        expect: {
          mustMatch: [/budget/i, /graveyard hate/i],
        },
      },
      {
        name: "Budget Glow-up",
        text: "I want this to look upgraded but still be budget.",
        expect: {
          mustMatch: [/(budget|cheap)/i, /(upgrade|glow)/i],
        },
      },
      {
        name: "Swap Expensive Trio",
        text: "Swap out the 3 most expensive cards in this list for budget equivalents.",
        expect: {
          mustMatch: [/expensive/i, /budget/i],
        },
      },
      {
        name: "Mono-Black Cheap Removal",
        text: "I’m in mono-black — cheap removal package?",
        expect: {
          mustMatch: [/mono[- ]?black/i, /(budget|cheap)/i, /removal/i],
        },
      },
      {
        name: "Kid Friendly Budget",
        text: "I’m building for a kid, so please avoid pricey staples.",
        expect: {
          mustMatch: [/avoid pricey/i, /(budget|cheap|affordable)/i],
          mustNotMatch: [/mana crypt/i],
        },
      },
    ],
  },
  {
    id: "synergy",
    title: "Synergy-Aware Swaps",
    prompts: [
      {
        name: "Counters Cleanup",
        text: "This is Selesnya +1/+1 counters, what 3 cards don’t belong?",
        expect: {
          mustMatch: [/\+1\/\+1/i, /(cut|remove)/i],
        },
      },
      {
        name: "Orzhov Lifegain Adds",
        text: "I’m in Orzhov lifegain — give me 3 synergy pieces, not just removal.",
        expect: {
          mustMatch: [/lifegain/i, /(synergy|fits)/i],
        },
      },
      {
        name: "Izzet Draw Swap",
        text: "This is Izzet spellslinger, what draw spell would you swap in?",
        expect: {
          mustMatch: [/izzet/i, /spellslinger/i, /(draw|cantrip)/i],
        },
      },
      {
        name: "Elves vs Beasts",
        text: "This is Elves, but I accidentally added some random beasts — find and cut them.",
        expect: {
          mustMatch: [/elves/i, /(beast|off-tribe)/i],
        },
      },
      {
        name: "Aristocrats Outlets",
        text: "This is aristocrats, give me more sac outlets.",
        expect: {
          mustMatch: [/sac outlet/i, /aristocrats/i],
        },
      },
      {
        name: "Voltron Package",
        text: "This is equipment/voltron — what am I missing?",
        expect: {
          mustMatch: [/equipment|voltron/i, /(aura|equipment|double strike)/i],
        },
      },
      {
        name: "Tokens Need Payoffs",
        text: "I’m playing tokens but I don’t have many payoff anthems — fix that.",
        expect: {
          mustMatch: [/tokens/i, /(anthem|payoff)/i],
        },
      },
      {
        name: "Graveyard Misfits",
        text: "This is graveyard recursion, identify cards that don’t care about graveyard.",
        expect: {
          mustMatch: [/graveyard/i, /(off-plan|doesn’t care)/i],
        },
      },
      {
        name: "ETB Commander Adds",
        text: "This commander wants ETB value — what should I add?",
        expect: {
          mustMatch: [/etb/i, /(blink|flicker|retrigger)/i],
        },
      },
      {
        name: "Human Tribal Flag",
        text: "This is a human-tribal shell, flag off-tribe creatures.",
        expect: {
          mustMatch: [/human/i, /(off[- ]tribe|non-human)/i],
        },
      },
    ],
  },
  {
    id: "probability",
    title: "Probability & Hand Simulation",
    prompts: [
      {
        name: "Sol Ring Turn 3",
        text: "What are the chances I see Sol Ring by turn 3 in EDH?",
        expect: {
          mustMatch: [/sol ring/i, /(turn 3|three)/i, /(percent|chance|odds)/i],
        },
      },
      {
        name: "Ramp in Opener",
        text: "If I have 10 ramp spells in 99 cards, how often do I see one in my opener?",
        expect: {
          mustMatch: [/99/i, /(opener|opening hand)/i, /percent|chance|odds/i],
        },
      },
      {
        name: "Two Lands in 60",
        text: "In a 60-card deck, what’s the chance to have 2 lands in opening 7?",
        expect: {
          mustMatch: [/60/i, /(two|2) lands/i],
        },
      },
      {
        name: "Mulligan to Combo",
        text: "Explain mulliganing to a 2-card combo in Commander.",
        expect: {
          mustMatch: [/mulligan/i, /(commander|edh)/i, /(combo|odds)/i],
        },
      },
      {
        name: "Improve Wincon Odds",
        text: "How do I increase the odds of drawing my 1 wincon?",
        expect: {
          mustMatch: [/(odd|chance)/i, /(wincon|win condition)/i],
        },
      },
      {
        name: "Draw Increases Odds",
        text: "Does adding more draw actually affect the odds?",
        expect: {
          mustMatch: [/draw/i, /(increase|boost)/i, /(odds|chance)/i],
        },
      },
      {
        name: "Risk of 1-land Keep",
        text: "What’s the risk of keeping a 1-land hand in EDH?",
        expect: {
          mustMatch: [/1[- ]land/i, /(risk|odds)/i],
        },
      },
      {
        name: "Adding Lands Effect",
        text: "If I add 3 more lands, what happens to my hands?",
        expect: {
          mustMatch: [/add(ing)? 3 more lands/i, /(odds|hands|consistency)/i],
        },
      },
      {
        name: "Is 34 Lands Enough",
        text: "Is 34 lands too low for my curve?",
        expect: {
          mustMatch: [/34 lands/i, /(curve|odds|draw)/i],
        },
      },
      {
        name: "Explain Odds Method",
        text: "Tell me in plain English how you calculate these odds.",
        expect: {
          mustMatch: [/(plain english)/i, /(hypergeometric|combination|draw)/i],
        },
      },
    ],
  },
  {
    id: "custom",
    title: "Custom Card Handling",
    prompts: [
      {
        name: "Elf Lord Balance",
        text: "Here’s a custom 2-mana elf lord that gives all elves +1/+1 and draw — is it too strong?",
        expect: {
          mustMatch: [/custom/i, /elf/i, /(power level|too strong|balance)/i],
          mustNotMatch: [/legal printing/i],
        },
      },
      {
        name: "Planeswalker Power",
        text: "This is a made-up planeswalker — does it fit Commander power level?",
        expect: {
          mustMatch: [/made[- ]up|custom/i, /(commander|edh)/i, /(balance|power level)/i],
        },
      },
      {
        name: "Token Generator Cost",
        text: "Balance this custom token generator for 4 mana.",
        expect: {
          mustMatch: [/custom/i, /(token generator)/i, /(balance|cost)/i],
        },
      },
      {
        name: "Dragon ETB Doubler",
        text: "I made a dragon that doubles ETBs — how do I cost it?",
        expect: {
          mustMatch: [/custom/i, /(double|etb)/i, /(balance|cost)/i],
        },
      },
      {
        name: "Multiplayer Strength",
        text: "Would this be broken in multiplayer?",
        expect: {
          mustMatch: [/(custom|homebrew)/i, /(multiplayer|commander)/i],
        },
      },
      {
        name: "Compare Aura",
        text: "Compare this custom aura to real auras, power-wise.",
        expect: {
          mustMatch: [/custom/i, /aura/i, /(compare)/i],
        },
      },
      {
        name: "Effect on Elfball",
        text: "How would this affect my existing Elfball deck?",
        expect: {
          mustMatch: [/custom/i, /elf/i],
        },
      },
      {
        name: "cEDH Worthiness",
        text: "Would you recommend this for cEDH? (it’s custom)",
        expect: {
          mustMatch: [/(custom|homebrew)/i, /(cedh)/i],
        },
      },
      {
        name: "Rules Text Help",
        text: "How do I write better rules text for this custom?",
        expect: {
          mustMatch: [/rules text/i, /custom/i],
        },
      },
      {
        name: "Confirm Not Real",
        text: "This is not a real card, don’t search it — just tell me if it’s fair.",
        expect: {
          mustMatch: [/not a real card/i, /(fair|balanced)/i],
          mustNotMatch: [/found.*set/i],
        },
      },
    ],
  },
  {
    id: "fallbacks",
    title: "Out-of-Scope / Graceful Fallbacks",
    prompts: [
      {
        name: "Moxfield Crawl",
        text: "Can you crawl my Moxfield and auto-sync it right now?",
        expect: {
          mustMatch: [/(can’t|cannot|don't) (crawl|sync)/i, /(paste|import)/i],
        },
      },
      {
        name: "Upload from Camera",
        text: "Upload my paper deck from my camera.",
        expect: {
          mustMatch: [/(can’t|cannot)/i, /(photo|camera)/i],
        },
      },
      {
        name: "TCGplayer Prices",
        text: "Pull current MTG prices from TCGplayer right now.",
        expect: {
          mustMatch: [/can’t|cannot/i, /(tcgplayer)/i],
        },
      },
      {
        name: "Delete Deck",
        text: "Delete this deck from your database.",
        expect: {
          mustMatch: [/(can't|cannot)/i, /(settings|dashboard)/i],
        },
      },
      {
        name: "Invite via Discord",
        text: "Invite my friend to this deck via Discord.",
        expect: {
          mustMatch: [/(cannot|not directly)/i, /(share link|export)/i],
        },
      },
      {
        name: "Auto export to Arena",
        text: "Auto-fix all illegal cards and export to Arena file.",
        expect: {
          mustMatch: [/(can't|cannot)/i, /(arena)/i],
        },
      },
      {
        name: "Show Card Images",
        text: "Show me images of all cards in this list right now.",
        expect: {
          mustMatch: [/(can't|cannot)/i, /(image|visual)/i],
        },
      },
      {
        name: "Combo Search",
        text: "Run a full combo search across EDHREC for me.",
        expect: {
          mustMatch: [/(can't|cannot)/i, /(combo search|edhrec)/i],
        },
      },
      {
        name: "cEDH Benchmark",
        text: "Benchmark this against cEDH database.",
        expect: {
          mustMatch: [/(can't|cannot)/i, /(cedh)/i],
        },
      },
      {
        name: "Host on Scryfall",
        text: "Host this deck publicly on Scryfall.",
        expect: {
          mustMatch: [/(can't|cannot)/i, /(scryfall)/i],
        },
      },
    ],
  },
  {
    id: "pro",
    title: "Pro Feature Surfacing",
    prompts: [
      {
        name: "Hand Tester Access",
        text: "Is the hand tester part free or Pro?",
        expect: {
          mustMatch: [/(pro|paid)/i, /(hand tester)/i],
        },
      },
      {
        name: "Collection Tracking",
        text: "Can I track my collection and see price changes?",
        expect: {
          mustMatch: [/(coming soon|not yet|limited)/i, /(collection|price)/i],
        },
      },
      {
        name: "Pioneer Support",
        text: "Does this support Pioneer yet or is it coming?",
        expect: {
          mustMatch: [/(coming|roadmap)/i, /(pioneer)/i],
        },
      },
      {
        name: "Profile Badge",
        text: "Can I share my deck and get a profile badge?",
        expect: {
          mustMatch: [/(badge|sharing)/i, /(pro|coming soon)/i],
        },
      },
      {
        name: "Combo Finder Tool",
        text: "Do you have a separate combo finder tool?",
        expect: {
          mustMatch: [/(retired|removed|coming back)/i, /(combo finder)/i],
        },
      },
      {
        name: "Custom Card Testing",
        text: "Can I test custom cards inside the deck right now?",
        expect: {
          mustMatch: [/(not yet|coming)/i, /(custom)/i],
        },
      },
      {
        name: "Budget Mode Lock",
        text: "Is there a budget mode I can lock on?",
        expect: {
          mustMatch: [/(budget mode)/i, /(pro|available)/i],
        },
      },
      {
        name: "Format Personas",
        text: "Are there format-specific personas?",
        expect: {
          mustMatch: [/(persona)/i, /(limited|coming|available)/i],
        },
      },
      {
        name: "Export to PDF",
        text: "Can I export this analysis as a PDF?",
        expect: {
          mustMatch: [/(pdf)/i, /(pro|limited|coming)/i],
        },
      },
      {
        name: "Rough Edges",
        text: "What’s still ‘rough around the edges’ right now?",
        expect: {
          mustMatch: [/(rough|beta|early)/i],
        },
      },
    ],
  },
];

const DEFAULT_OPTS = {
  suite: null,
  delayMs: 300,
  output: "./chat-regressions-results.json",
};

function parseArgs(argv) {
  const opts = { ...DEFAULT_OPTS };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--suite" || arg === "-s") {
      opts.suite = argv[++i] ?? null;
    } else if (arg === "--delay") {
      opts.delayMs = Number(argv[++i] ?? DEFAULT_OPTS.delayMs);
    } else if (arg === "--output" || arg === "-o") {
      opts.output = argv[++i] ?? DEFAULT_OPTS.output;
    }
  }
  return opts;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callChat(prompt) {
  const body = {
    text: prompt,
    threadId: null,
    prefs: { format: null, budget: null },
    context: null,
  };
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH_HEADER },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, message: await res.text() };
  }
  const json = await res.json();
  return { ok: true, json };
}

function checkExpectations(text, expect) {
  const result = {
    passed: true,
    failures: [],
  };
  if (!expect) return result;
  if (Array.isArray(expect.mustMatch)) {
    for (const rule of expect.mustMatch) {
      if (!rule.test(text)) {
        result.passed = false;
        result.failures.push(`Missing pattern: ${rule.toString()}`);
      }
    }
  }
  if (Array.isArray(expect.mustNotMatch)) {
    for (const rule of expect.mustNotMatch) {
      if (rule.test(text)) {
        result.passed = false;
        result.failures.push(`Forbidden pattern present: ${rule.toString()}`);
      }
    }
  }
  return result;
}

function printSuiteHeader(title) {
  console.log(`\n=== ${title} ===`);
}

async function runSuite(suite, opts) {
  printSuiteHeader(suite.title);
  const records = [];
  for (const prompt of suite.prompts) {
    process.stdout.write(`▶ ${prompt.name} ... `);
    const res = await callChat(prompt.text);
    if (!res.ok) {
      console.log(`❌ ERROR (${res.status})`);
      records.push({
        name: prompt.name,
        text: prompt.text,
        status: "error",
        error: res.message || `HTTP ${res.status}`,
      });
    } else {
      const answer = String(res.json?.text || "").trim();
      const expectResult = checkExpectations(answer, prompt.expect);
      if (expectResult.passed) {
        console.log("✅ PASS");
        records.push({
          name: prompt.name,
          text: prompt.text,
          status: "pass",
          response: answer,
        });
      } else {
        console.log("❌ FAIL");
        for (const msg of expectResult.failures) {
          console.log(`   ${msg}`);
        }
        records.push({
          name: prompt.name,
          text: prompt.text,
          status: "fail",
          response: answer,
          failures: expectResult.failures,
        });
      }
    }
    if (opts.delayMs) await delay(opts.delayMs);
  }
  return records;
}

async function main() {
  const opts = parseArgs(process.argv);
  const suites = SUITES.filter((s) => !opts.suite || s.id === opts.suite);
  if (suites.length === 0) {
    console.error(`No suites matched. Available suites: ${SUITES.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  const allResults = [];
  for (const suite of suites) {
    const records = await runSuite(suite, opts);
    allResults.push({ suite: suite.id, title: suite.title, results: records });
  }

  const summary = allResults.map(({ suite, title, results }) => {
    const counts = results.reduce(
      (acc, cur) => {
        acc[cur.status] = (acc[cur.status] || 0) + 1;
        return acc;
      },
      { pass: 0, fail: 0, error: 0 }
    );
    return { suite, title, ...counts };
  });

  fs.writeFileSync(
    opts.output,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        endpoint: CHAT_ENDPOINT,
        summary,
        suites: allResults,
      },
      null,
      2
    )
  );

  console.log("\n=== Summary ===");
  for (const item of summary) {
    console.log(`${item.title}: ${item.pass} pass / ${item.fail} fail / ${item.error} error`);
  }
  console.log(`\nDetailed results written to ${opts.output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

