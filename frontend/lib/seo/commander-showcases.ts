import { HAND_BUILT_COMMANDER_GUIDES, type HandBuiltCommanderGuide } from "@/lib/data/commander-handbuilt-guides";

export type CommanderShowcasePageType = "best-cards" | "budget-upgrades";

export type CommanderShowcaseMetadata = {
  title: string;
  description: string;
  openGraphTitle: string;
  openGraphDescription: string;
};

export type CommanderShowcasePackage = {
  title: string;
  kicker: string;
  body: string;
  cards: string[];
};

export type CommanderShowcaseRule = {
  label: string;
  value: string;
  body: string;
};

export type CommanderShowcasePriority = {
  step: string;
  title: string;
  body: string;
};

export type CommanderLandingShowcaseContent = {
  slug: string;
  pageType: CommanderShowcasePageType;
  metadata: CommanderShowcaseMetadata;
  kicker: string;
  headline: string;
  intro: string;
  pills: string[];
  communitySignal: {
    value: string;
    body: string;
    useDeckCount?: boolean;
  };
  firstUpgrade: {
    title: string;
    body: string;
  };
  rules: CommanderShowcaseRule[];
  packagesTitle: string;
  packagesSubtitle: string;
  ctaHref: string;
  ctaLabel: string;
  packages: CommanderShowcasePackage[];
  priorityTitle: string;
  priorities: CommanderShowcasePriority[];
};

function key(slug: string, pageType: CommanderShowcasePageType) {
  return `${slug}:${pageType}`;
}

function cardRefs(cards: string[]) {
  return cards.slice(0, 2).map((card) => `[[${card}]]`).join(" and ");
}

function packageBody(guide: HandBuiltCommanderGuide, title: string, pageType: CommanderShowcasePageType) {
  if (pageType === "budget-upgrades") {
    return `${title} is the spend-first lane for ${guide.shortName}: it improves the deck's normal games before you chase luxury singles.`;
  }
  return `${title} is one of the packages that makes ${guide.shortName}'s ${guide.archetype} plan feel intentional instead of generic Commander goodstuff.`;
}

function buildGeneratedShowcase(
  guide: HandBuiltCommanderGuide,
  pageType: CommanderShowcasePageType,
): CommanderLandingShowcaseContent {
  const isBudget = pageType === "budget-upgrades";
  const lanes = isBudget ? guide.budgetLanes : guide.bestLanes;
  const pageLabel = isBudget ? "Budget Upgrades" : "Best Cards";
  const firstRule = isBudget
    ? {
        label: "Spend first",
        value: guide.budgetFirstUpgrade,
        body: `Start with the cards that make ${guide.shortName} function every game. The luxury cards are better once the shell already curves and protects itself.`,
      }
    : {
        label: "Primary plan",
        value: guide.pills[0] ?? guide.archetype,
        body: `${guide.shortName} is strongest when every include supports ${guide.archetype}. Start with role players that make the commander reliable.`,
      };

  return {
    slug: guide.slug,
    pageType,
    metadata: {
      title: `${guide.name} ${pageLabel}: Hand-Built EDH Guide 2026`,
      description: isBudget
        ? `Budget upgrades for ${guide.name} Commander: ${guide.budgetFirstUpgrade}, key packages, traps to avoid, and premium cards to save for later.`
        : `Best cards for ${guide.name} Commander: ${guide.firstUpgrade}, key packages, deckbuilding rules, and traps to avoid.`,
      openGraphTitle: `${guide.name} ${pageLabel} - ManaTap Commander Guide`,
      openGraphDescription: isBudget
        ? `A hand-built ${guide.name} budget upgrade guide for ${guide.archetype}.`
        : `A hand-built ${guide.name} best cards guide for ${guide.archetype}.`,
    },
    kicker: guide.archetype,
    headline: isBudget
      ? `Upgrade ${guide.name} by making the core plan reliable before buying the flashy finishers.`
      : `The best ${guide.name} cards make ${guide.archetype} happen on time and with protection.`,
    intro: isBudget
      ? `${guide.name} does not need random cheap cards. It needs budget upgrades that protect the commander plan, smooth the first three turns, and turn ${guide.shortName}'s natural payoffs into repeatable pressure.`
      : `${guide.loveReason} The right list is built from role packages: setup, engine, payoff, and protection all pulling toward the same game plan.`,
    pills: guide.pills,
    communitySignal: {
      value: isBudget ? "Budget tune-up" : "Commander staple map",
      body: "Curated with EDHREC-style role signals, Scryfall card data, and ManaTap commander research.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: isBudget ? guide.budgetFirstUpgrade : guide.firstUpgrade,
      body: isBudget
        ? `Fix this lane first. It shows up in more games than a single expensive finisher.`
        : `This is the card package that most directly improves how ${guide.shortName} plays at real tables.`,
    },
    rules: [
      firstRule,
      {
        label: isBudget ? "Do not dilute" : "Avoid the trap",
        value: guide.traps[0] ?? "Keep the plan focused",
        body: `${guide.shortName} loses percentage points when the list drifts into cards that look powerful but do not support the commander turn.`,
      },
      {
        label: isBudget ? "Save for later" : "Close cleanly",
        value: isBudget ? lanes[3]?.title ?? "Premium finishers" : guide.winPaths[0] ?? "Convert advantage into a win",
        body: isBudget
          ? `Premium upgrades are best after mana, card flow, and protection are solved.`
          : `The best cards do not just create value; they turn ${guide.shortName}'s advantage into a real endgame.`,
      },
    ],
    packagesTitle: isBudget ? `Budget Upgrade Packages for ${guide.name}` : `Best Card Packages for ${guide.name}`,
    packagesSubtitle: isBudget
      ? "Use these as staged upgrades: consistency first, splash later."
      : "Use these as deckbuilding lanes, not just a shopping list.",
    ctaHref: isBudget ? "/collections/cost-to-finish" : "/build-a-deck",
    ctaLabel: isBudget ? `Price-check your ${guide.shortName} upgrades` : `Analyze your ${guide.shortName} list`,
    packages: lanes.map((lane) => ({
      title: lane.title,
      kicker: lane.kicker,
      body: packageBody(guide, lane.title, pageType),
      cards: lane.cards,
    })),
    priorityTitle: isBudget ? "Budget Upgrade Priority" : "Upgrade Priority",
    priorities: lanes.map((lane, index) => ({
      step: String(index + 1),
      title: lane.title,
      body: `${cardRefs(lane.cards)} are the first cards to compare when tuning this lane for ${guide.shortName}.`,
    })),
  };
}

const GENERATED_SHOWCASES: Record<string, CommanderLandingShowcaseContent> = Object.fromEntries(
  Object.values(HAND_BUILT_COMMANDER_GUIDES).flatMap((guide) => [
    [key(guide.slug, "best-cards"), buildGeneratedShowcase(guide, "best-cards")],
    [key(guide.slug, "budget-upgrades"), buildGeneratedShowcase(guide, "budget-upgrades")],
  ]),
);

const SHOWCASES: Record<string, CommanderLandingShowcaseContent> = {
  [key("y-shtola-night-s-blessed", "best-cards")]: {
    slug: "y-shtola-night-s-blessed",
    pageType: "best-cards",
    metadata: {
      title: "Y'shtola Best Cards: Esper Spellslinger EDH Upgrade Guide",
      description:
        "Best cards for Y'shtola, Night's Blessed Commander: curiosity engines, mana value 3+ noncreature spells, Esper interaction, and real finishers.",
      openGraphTitle: "Best Cards for Y'shtola, Night's Blessed - ManaTap EDH Guide",
      openGraphDescription:
        "A hand-built Y'shtola Commander card guide for Esper control, curiosity engines, interaction, and finishers.",
    },
    kicker: "Esper spellslinger control",
    headline: "The best Y'shtola, Night's Blessed cards are the ones that make every turn cycle bleed.",
    intro:
      "Y'shtola is not just an Esper goodstuff commander. She rewards mana value 3+ noncreature spells, checks whether a player lost 4 life before each end step, and turns that pressure into cards.",
    pills: ["MV 3+ noncreature spells", "4 life before end step", "Control first, lifegain second"],
    communitySignal: {
      value: "Fast-rising",
      body: "EDHREC and public deck sites show a major Y'shtola spike",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Card-flow engines",
      body: "Curiosity effects, Archmage Emeritus, and clean interaction beat splashy haymakers.",
    },
    rules: [
      {
        label: "Cast threshold spells",
        value: "Noncreature, mana value 3+",
        body: "These are the cards that actually trigger Y'shtola's table drain. Prioritize spells that affect the board, protect you, or refill your hand.",
      },
      {
        label: "Make 4 life happen early",
        value: "Before each end step",
        body: "Her card draw checks as the end step begins. Damage, life loss, and drain need to happen before that window.",
      },
      {
        label: "Avoid fake lifegain",
        value: "Lifegain is a result, not the plan",
        body: "Random lifegain cards make the deck softer. Cards that drain, interact, or double Y'shtola's damage are the real glue.",
      },
    ],
    packagesTitle: "Best Card Packages for Y'shtola",
    packagesSubtitle: "Use these as deckbuilding lanes, not just a shopping list.",
    ctaHref: "/build-a-deck",
    ctaLabel: "Analyze your list",
    packages: [
      {
        title: "Turn Every Trigger Into Cards",
        kicker: "Engine",
        body:
          "Y'shtola deals damage herself, so curiosity effects are not cute here. They turn each mana value 3+ noncreature spell into drain plus extra cards.",
        cards: ["Curiosity", "Ophidian Eye", "Archmage Emeritus", "Rhystic Study", "Propaganda"],
      },
      {
        title: "Keep Tempo While Hitting 4 Life",
        kicker: "Interaction",
        body:
          "The best removal is cheap, flexible, and easy to hold up. You want to answer the table while still setting up an end-step draw trigger.",
        cards: ["Snuff Out", "Void Rend", "Vindicate", "Anguished Unmaking", "Swords to Plowshares"],
      },
      {
        title: "Close Without Becoming Creature Soup",
        kicker: "Finishers",
        body:
          "The deck usually wins by compounding small drains until one spell or lifegain payoff makes the math collapse.",
        cards: ["Exsanguinate", "Papalymo Totolymo", "Emet-Selch of the Third Seat", "Vito, Thorn of the Dusk Rose", "Enduring Tenacity"],
      },
      {
        title: "Protect the Control Shell",
        kicker: "Support",
        body:
          "Mana, protection, and reset buttons matter because Y'shtola is powerful only if you keep playing on everyone else's turn cycle.",
        cards: ["Archaeomancer's Map", "Smothering Tithe", "Teferi's Protection", "Cyclonic Rift", "Deadly Rollick"],
      },
    ],
    priorityTitle: "Upgrade Priority",
    priorities: [
      { step: "1", title: "Reliable card flow", body: "[[Curiosity]], [[Ophidian Eye]], and [[Archmage Emeritus]] make Y'shtola feel unfair." },
      { step: "2", title: "Cheap premium answers", body: "[[Snuff Out]], [[Void Rend]], and [[Anguished Unmaking]] keep you alive without losing tempo." },
      { step: "3", title: "Actual closers", body: "[[Exsanguinate]] and drain payoffs turn control turns into a real win condition." },
    ],
  },
  [key("the-ur-dragon", "best-cards")]: {
    slug: "the-ur-dragon",
    pageType: "best-cards",
    metadata: {
      title: "The Ur-Dragon Best Cards: Dragon Ramp EDH Upgrade Guide",
      description:
        "Best cards for The Ur-Dragon Commander: five-color ramp, dragon cost reducers, Dragon Tempest payoffs, immediate-impact dragons, and premium interaction.",
      openGraphTitle: "Best Cards for The Ur-Dragon - ManaTap EDH Guide",
      openGraphDescription:
        "A hand-built The Ur-Dragon card guide for five-color dragon ramp, payoff dragons, cost reducers, and finishers.",
    },
    kicker: "Five-color dragon ramp",
    headline: "The best The Ur-Dragon cards make the deck cast dragons before the table is ready.",
    intro:
      "The Ur-Dragon is strongest when the deck behaves like ramp and cost reduction first, dragon tribal second. Big flyers are not enough; every expensive slot should create cards, mana, damage, or a lethal attack step.",
    pills: ["Ramp before dragons", "Cost reducers matter", "Immediate impact top end"],
    communitySignal: {
      value: "Rank #1 commander",
      body: "EDHREC shows The Ur-Dragon at the top of the commander field, so every slot has a huge sample behind it.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Mana and reduction",
      body: "Farseek, Dragon's Hoard, Orb of Dragonkind, and Urza's Incubator make the flashy cards actually castable.",
    },
    rules: [
      {
        label: "Fix five colors early",
        value: "Lands and ramp first",
        body: "A perfect dragon hand still loses if it cannot cast spells before turn five. Prioritize clean fixing and two-mana ramp before luxury threats.",
      },
      {
        label: "Choose dragons by impact",
        value: "Cards, treasure, or damage",
        body: "The best dragons change the game immediately. Vanilla size matters less than triggers that snowball the next dragon.",
      },
      {
        label: "Trim binder dragons",
        value: "Not every dragon belongs",
        body: "If a top-end card only looks cool and does nothing until the next turn, it is often worse than another enabler.",
      },
    ],
    packagesTitle: "Best Card Packages for The Ur-Dragon",
    packagesSubtitle: "Build the deck around jobs: cast dragons, multiply them, then end the game.",
    ctaHref: "/build-a-deck",
    ctaLabel: "Analyze your dragon list",
    packages: [
      {
        title: "Make Five Colors Work",
        kicker: "Ramp",
        body: "These are the cards that make the first dragon arrive on schedule instead of sitting in hand.",
        cards: ["Farseek", "Nature's Lore", "Three Visits", "Arcane Signet", "The World Tree"],
      },
      {
        title: "Cheat on Dragon Mana",
        kicker: "Reducers",
        body: "Cost reducers and tribal rocks are the real engine because they turn seven-mana dragons into playable midgame spells.",
        cards: ["Dragon's Hoard", "Orb of Dragonkind", "Dragonlord's Servant", "Dragonspeaker Shaman", "Urza's Incubator"],
      },
      {
        title: "Turn Dragons Into Payoffs",
        kicker: "Engine",
        body: "The best dragon payoffs make each body produce cards, treasure, damage, or another body.",
        cards: ["Dragon Tempest", "Miirym, Sentinel Wyrm", "Lathliss, Dragon Queen", "Scourge of Valkas", "Terror of the Peaks"],
      },
      {
        title: "Top End That Ends Games",
        kicker: "Finishers",
        body: "These dragons justify their mana because one attack or trigger can put the whole table on a clock.",
        cards: ["Old Gnawbone", "Atarka, World Render", "Tiamat", "Utvara Hellkite", "Balefire Dragon"],
      },
    ],
    priorityTitle: "Upgrade Priority",
    priorities: [
      { step: "1", title: "Fix the opening turns", body: "[[Farseek]], [[Nature's Lore]], and better five-color lands improve every game." },
      { step: "2", title: "Add reducers", body: "[[Dragon's Hoard]], [[Orb of Dragonkind]], and [[Urza's Incubator]] turn the deck from clunky to explosive." },
      { step: "3", title: "Buy impact dragons last", body: "[[Miirym, Sentinel Wyrm]], [[Old Gnawbone]], and [[Terror of the Peaks]] matter most once the shell can cast them." },
    ],
  },
  [key("the-ur-dragon", "budget-upgrades")]: {
    slug: "the-ur-dragon",
    pageType: "budget-upgrades",
    metadata: {
      title: "The Ur-Dragon Budget Upgrades: Cheap Dragon EDH Fixes",
      description:
        "Budget upgrades for The Ur-Dragon Commander: mana fixing, dragon cost reducers, cheap payoff dragons, and premium upgrades worth saving for.",
      openGraphTitle: "The Ur-Dragon Budget Upgrades - ManaTap EDH Guide",
      openGraphDescription:
        "A practical upgrade path for The Ur-Dragon: fix mana first, add reducers, then buy dragons that actually end games.",
    },
    kicker: "Budget dragon upgrades",
    headline: "Upgrade The Ur-Dragon by fixing the engine before buying another mythic dragon.",
    intro:
      "The most common budget trap is spending on one huge dragon while the deck still stumbles on colors. The best upgrade path starts with mana, reducers, and cheap payoffs that make every expensive card better.",
    pills: ["Fix colors first", "Reducers beat luxury threats", "Upgrade dragons by role"],
    communitySignal: {
      value: "Huge demand",
      body: "Search Console shows this budget page already gets major impressions with low CTR.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Consistency cards",
      body: "Budget lands, two-mana ramp, and dragon rocks usually outperform one splashy finisher.",
    },
    rules: [
      {
        label: "Spend on casting spells",
        value: "Mana base, ramp, reducers",
        body: "Every dragon gets better when the deck stops missing colors. Budget fixing is not glamorous, but it raises the floor immediately.",
      },
      {
        label: "Buy role players",
        value: "Not just cheaper dragons",
        body: "A budget upgrade should solve a job: ramp, draw, damage, protection, or recovery.",
      },
      {
        label: "Save for true haymakers",
        value: "Premium cards later",
        body: "Expensive dragons are worth it only after your early turns reliably get you to the first dragon.",
      },
    ],
    packagesTitle: "Budget Upgrade Packages for The Ur-Dragon",
    packagesSubtitle: "A cleaner upgrade order for Dragon decks that still need to hit their colors.",
    ctaHref: "/collections/cost-to-finish",
    ctaLabel: "Price the upgrades",
    packages: [
      {
        title: "Budget Five-Color Fixing",
        kicker: "Mana",
        body: "Start here if your hand often has dragons but not the colors to cast them.",
        cards: ["Path of Ancestry", "Unclaimed Territory", "Secluded Courtyard", "Haven of the Spirit Dragon", "Command Tower"],
      },
      {
        title: "Cheap Ramp That Still Matters",
        kicker: "Ramp",
        body: "These cards help bridge from setup turns into the first real dragon turn.",
        cards: ["Farseek", "Rampant Growth", "Cultivate", "Kodama's Reach", "Arcane Signet"],
      },
      {
        title: "Affordable Dragon Glue",
        kicker: "Synergy",
        body: "Cost reducers and tribal support make every future upgrade hit harder.",
        cards: ["Dragonlord's Servant", "Dragonspeaker Shaman", "Dragon's Hoard", "Orb of Dragonkind", "Sarkhan's Triumph"],
      },
      {
        title: "Save For These Premiums",
        kicker: "Premium",
        body: "These are the pricier upgrades that change the ceiling once the mana is fixed.",
        cards: ["Urza's Incubator", "The World Tree", "Old Gnawbone", "Terror of the Peaks", "The Great Henge"],
      },
    ],
    priorityTitle: "Budget Priority",
    priorities: [
      { step: "1", title: "Make the mana honest", body: "[[Path of Ancestry]], [[Unclaimed Territory]], and [[Farseek]] make more hands keepable." },
      { step: "2", title: "Lower dragon costs", body: "[[Dragonlord's Servant]], [[Dragonspeaker Shaman]], and [[Dragon's Hoard]] do more than another random six-drop." },
      { step: "3", title: "Upgrade finishers selectively", body: "Save for [[Urza's Incubator]], [[Old Gnawbone]], and [[Terror of the Peaks]] after the shell works." },
    ],
  },
  [key("krenko-mob-boss", "best-cards")]: {
    slug: "krenko-mob-boss",
    pageType: "best-cards",
    metadata: {
      title: "Krenko, Mob Boss Best Cards: Goblin Combo EDH Guide",
      description:
        "Best cards for Krenko, Mob Boss Commander: haste, untap engines, Skirk Prospector mana, Thornbite Staff combos, and Purphoros-style finishers.",
      openGraphTitle: "Best Cards for Krenko, Mob Boss - ManaTap EDH Guide",
      openGraphDescription:
        "A focused Krenko Commander guide for haste, untaps, token mana, and damage converters.",
    },
    kicker: "Mono-red goblin combo",
    headline: "The best Krenko cards either activate him now or turn one tap into lethal damage.",
    intro:
      "Krenko is not asking for random goblin volume. He wants haste, protection, untap effects, token-to-mana engines, and payoffs that make one activation end the game.",
    pills: ["Haste first", "Untap Krenko", "Convert tokens immediately"],
    communitySignal: {
      value: "Combo pressure",
      body: "Krenko lists cluster around the same high-impact cards because one activation snowballs so quickly.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Haste and mana",
      body: "Skirk Prospector, Battle Hymn, and haste enablers make Krenko dangerous the turn he lands.",
    },
    rules: [
      {
        label: "Activate immediately",
        value: "Haste is protection",
        body: "If Krenko waits a full turn cycle, the table gets a clean answer window. Haste and pseudo-haste are core cards here.",
      },
      {
        label: "Turn goblins into resources",
        value: "Mana, cards, damage",
        body: "A huge board is fragile. Mana, Skullclamp cards, and direct damage make the tokens matter before a wrath.",
      },
      {
        label: "Avoid cute goblins",
        value: "Every slot needs a job",
        body: "Tribal filler that neither accelerates, protects, untaps, nor kills is usually the first cut.",
      },
    ],
    packagesTitle: "Best Card Packages for Krenko",
    packagesSubtitle: "The deck is strongest when every card supports the first explosive tap.",
    ctaHref: "/build-a-deck",
    ctaLabel: "Analyze your goblin list",
    packages: [
      {
        title: "Make the First Tap Happen",
        kicker: "Haste",
        body: "These cards reduce the window where opponents can remove Krenko before he matters.",
        cards: ["Lightning Greaves", "Swiftfoot Boots", "Thousand-Year Elixir", "Goblin Warchief", "Fervor"],
      },
      {
        title: "Turn Tokens Into Mana",
        kicker: "Mana",
        body: "Token-to-mana effects let a single activation become the rest of your turn.",
        cards: ["Skirk Prospector", "Battle Hymn", "Brightstone Ritual", "Mana Echoes", "Ashnod's Altar"],
      },
      {
        title: "Untap the Boss",
        kicker: "Combo",
        body: "Untap engines are what push Krenko from fair swarm deck into combo territory.",
        cards: ["Thornbite Staff", "Staff of Domination", "Umbral Mantle", "Sword of the Paruns", "Illusionist's Bracers"],
      },
      {
        title: "Kill Without Combat",
        kicker: "Finishers",
        body: "Damage converters punish the table even through blockers, fogs, or a stalled board.",
        cards: ["Purphoros, God of the Forge", "Impact Tremors", "Goblin Bombardment", "Witty Roastmaster", "Mob Justice"],
      },
    ],
    priorityTitle: "Upgrade Priority",
    priorities: [
      { step: "1", title: "Give Krenko haste", body: "[[Lightning Greaves]], [[Swiftfoot Boots]], and [[Thousand-Year Elixir]] make removal much harder for the table." },
      { step: "2", title: "Add token mana", body: "[[Skirk Prospector]], [[Battle Hymn]], and [[Brightstone Ritual]] turn one tap into a full combo turn." },
      { step: "3", title: "Add noncombat kills", body: "[[Purphoros, God of the Forge]], [[Impact Tremors]], and [[Goblin Bombardment]] make tokens lethal immediately." },
    ],
  },
  [key("edgar-markov", "best-cards")]: {
    slug: "edgar-markov",
    pageType: "best-cards",
    metadata: {
      title: "Edgar Markov Best Cards: Vampire Aggro EDH Upgrade Guide",
      description:
        "Best cards for Edgar Markov Commander: cheap vampires, Skullclamp card flow, anthem finishers, Blood Artist drains, and low-curve pressure.",
      openGraphTitle: "Best Cards for Edgar Markov - ManaTap EDH Guide",
      openGraphDescription:
        "A hand-built Edgar Markov card guide for low-curve vampires, token payoffs, draw engines, and finishers.",
    },
    kicker: "Mardu vampire snowball",
    headline: "The best Edgar Markov cards make eminence feel unfair before turn four.",
    intro:
      "Edgar is strongest when the deck stays low to the ground. Cheap vampires create free bodies, card-flow engines punish that width, and anthem or drain payoffs turn small creatures into a real clock.",
    pills: ["One-drops matter", "Draw off tokens", "Finish with width"],
    communitySignal: {
      value: "Evergreen favorite",
      body: "Edgar remains one of the clearest vampire payoffs in Commander, and the best lists stay lean.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Cheap pressure",
      body: "One- and two-mana vampires plus Skullclamp-style card flow matter more than expensive vampire legends.",
    },
    rules: [
      {
        label: "Curve under the table",
        value: "Start on turn one",
        body: "Eminence rewards early vampire density. Hands that start on turn three are much worse than they look.",
      },
      {
        label: "Cash in free bodies",
        value: "Draw and drains",
        body: "Tokens become real resources when they feed Skullclamp, Champion of Dusk, Blood Artist effects, and anthem math.",
      },
      {
        label: "Cut vampire soup",
        value: "Cool is not enough",
        body: "Expensive vampires that do not draw, drain, protect, or end the game should fight for very few slots.",
      },
    ],
    packagesTitle: "Best Card Packages for Edgar Markov",
    packagesSubtitle: "Build around low-cost vampires first, then add the payoffs that make width lethal.",
    ctaHref: "/build-a-deck",
    ctaLabel: "Analyze your vampire list",
    packages: [
      {
        title: "Start the Snowball",
        kicker: "Curve",
        body: "Cheap vampires are the engine because every one comes with an extra body.",
        cards: ["Voldaren Epicure", "Indulgent Aristocrat", "Knight of the Ebon Legion", "Viscera Seer", "Stromkirk Noble"],
      },
      {
        title: "Turn Tokens Into Cards",
        kicker: "Draw",
        body: "Card flow keeps the deck from dumping its hand and hoping the first board survives.",
        cards: ["Skullclamp", "Champion of Dusk", "Welcoming Vampire", "Tocasia's Welcome", "Pact of the Serpent"],
      },
      {
        title: "Make Width Hit Hard",
        kicker: "Anthems",
        body: "The strongest finishers reward the army Edgar creates for free.",
        cards: ["Shared Animosity", "Cordial Vampire", "Stromkirk Captain", "Legion Lieutenant", "Captivating Vampire"],
      },
      {
        title: "Drain Through Wipes",
        kicker: "Reach",
        body: "Drain effects let the deck keep pressure even when combat stalls or creatures die.",
        cards: ["Blood Artist", "Cruel Celebrant", "Sanctum Seeker", "Malakir Bloodwitch", "Patriarch's Bidding"],
      },
    ],
    priorityTitle: "Upgrade Priority",
    priorities: [
      { step: "1", title: "Lower the curve", body: "[[Voldaren Epicure]], [[Indulgent Aristocrat]], and cheap vampires make eminence matter right away." },
      { step: "2", title: "Add card flow", body: "[[Skullclamp]], [[Champion of Dusk]], and [[Welcoming Vampire]] keep the deck from running out of gas." },
      { step: "3", title: "Buy lethal payoffs", body: "[[Shared Animosity]], [[Cordial Vampire]], and [[Patriarch's Bidding]] turn recovery or one attack into lethal pressure." },
    ],
  },
  [key("edgar-markov", "budget-upgrades")]: {
    slug: "edgar-markov",
    pageType: "budget-upgrades",
    metadata: {
      title: "Edgar Markov Budget Upgrades: Cheap Vampire EDH Fixes",
      description:
        "Budget upgrades for Edgar Markov Commander: cheap vampires, Skullclamp-style draw, vampire lords, drain payoffs, and recovery without buying every premium staple.",
      openGraphTitle: "Edgar Markov Budget Upgrades - ManaTap EDH Guide",
      openGraphDescription:
        "A budget Edgar upgrade path focused on curve, card flow, and vampire payoffs instead of expensive top-end.",
    },
    kicker: "Budget vampire aggro",
    headline: "Upgrade Edgar Markov by making the first three turns scarier, not by buying bigger vampires.",
    intro:
      "Budget Edgar lists get better fastest when the curve gets cleaner. Cheap vampires, reliable draw, and compact finishers make the free tokens matter without requiring a pile of premium lands.",
    pills: ["Curve first", "Draw second", "Top end last"],
    communitySignal: {
      value: "Low CTR opportunity",
      body: "Search Console shows this budget page has strong impressions but needs a sharper reason to click.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Cheap vampires plus draw",
      body: "The best budget buys make every opening hand faster or every token worth a card.",
    },
    rules: [
      {
        label: "Upgrade the floor",
        value: "One- and two-drops",
        body: "A cheap vampire that starts the snowball usually beats a pricier vampire that only matters after Edgar is already ahead.",
      },
      {
        label: "Protect card flow",
        value: "Do not run empty",
        body: "Budget decks lose when they dump their hand and fail to rebuild. Draw engines are not optional here.",
      },
      {
        label: "Skip flashy lifegain",
        value: "Pressure wins games",
        body: "Lifegain cards that do not create bodies, cards, or damage usually slow Edgar down.",
      },
    ],
    packagesTitle: "Budget Upgrade Packages for Edgar Markov",
    packagesSubtitle: "A practical order for making Edgar faster and more resilient.",
    ctaHref: "/deck/swap-suggestions",
    ctaLabel: "Find cheaper swaps",
    packages: [
      {
        title: "Cheap Vampires That Matter",
        kicker: "Curve",
        body: "These cards improve the most important turns without asking for premium mana.",
        cards: ["Voldaren Epicure", "Indulgent Aristocrat", "Viscera Seer", "Bloodtithe Harvester", "Legion Lieutenant"],
      },
      {
        title: "Budget Card Flow",
        kicker: "Draw",
        body: "Spend early budget on cards that let the deck reload after committing creatures.",
        cards: ["Skullclamp", "Pact of the Serpent", "Champion of Dusk", "Welcoming Vampire", "Tocasia's Welcome"],
      },
      {
        title: "Affordable Payoffs",
        kicker: "Damage",
        body: "These cards turn free tokens into real damage without requiring a premium combo package.",
        cards: ["Cordial Vampire", "Stromkirk Captain", "Sanctum Seeker", "Cruel Celebrant", "Blood Artist"],
      },
      {
        title: "Recovery After Wipes",
        kicker: "Resilience",
        body: "Budget Edgar still needs ways to rebuild after the table answers the first board.",
        cards: ["Patriarch's Bidding", "Olivia's Wrath", "Victimize", "Return to the Ranks", "Unearth"],
      },
    ],
    priorityTitle: "Budget Priority",
    priorities: [
      { step: "1", title: "Buy early vampires", body: "[[Voldaren Epicure]], [[Indulgent Aristocrat]], and [[Legion Lieutenant]] make the deck faster right away." },
      { step: "2", title: "Add draw before luxury", body: "[[Skullclamp]], [[Pact of the Serpent]], and [[Champion of Dusk]] keep budget lists from stalling." },
      { step: "3", title: "Finish through removal", body: "[[Blood Artist]], [[Cruel Celebrant]], and [[Patriarch's Bidding]] punish wipes and stalled boards." },
    ],
  },
  [key("kaalia-of-the-vast", "best-cards")]: {
    slug: "kaalia-of-the-vast",
    pageType: "best-cards",
    metadata: {
      title: "Kaalia of the Vast Best Cards: Protected Attack EDH Guide",
      description:
        "Best cards for Kaalia of the Vast Commander: boots, haste, protection, Angels, Demons, Dragons, Master of Cruelties lines, and cheap interaction.",
      openGraphTitle: "Best Cards for Kaalia of the Vast - ManaTap EDH Guide",
      openGraphDescription:
        "A focused Kaalia card guide for protected attacks, premium cheat targets, and anti-clunky deckbuilding.",
    },
    kicker: "Mardu protected attack",
    headline: "The best Kaalia cards make the first attack happen safely, then punish the table immediately.",
    intro:
      "Kaalia does not need every giant Angel, Demon, and Dragon. She needs acceleration, haste, protection, and cheat targets that change the board the moment they enter attacking.",
    pills: ["Protect Kaalia", "Cheat impact threats", "Avoid uncastable hands"],
    communitySignal: {
      value: "Classic threat",
      body: "Kaalia has a huge commander sample, and the strongest card choices are about reliability before spectacle.",
      useDeckCount: true,
    },
    firstUpgrade: {
      title: "Boots before bombs",
      body: "Lightning Greaves and Swiftfoot Boots often matter more than one more expensive creature.",
    },
    rules: [
      {
        label: "Attack once safely",
        value: "Protection is the plan",
        body: "The deck is built around Kaalia connecting. Haste, protection, and cheap answers are part of the win condition.",
      },
      {
        label: "Choose immediate threats",
        value: "ETB or attack impact",
        body: "A cheat target should remove, lock, draw, or threaten lethal immediately. Raw size is not enough.",
      },
      {
        label: "Avoid top-end soup",
        value: "Hands must function",
        body: "Too many giant creatures make openers look exciting but unplayable. Keep enough support to cast the deck without Kaalia.",
      },
    ],
    packagesTitle: "Best Card Packages for Kaalia",
    packagesSubtitle: "Every package should either protect the first swing or make that swing devastating.",
    ctaHref: "/build-a-deck",
    ctaLabel: "Analyze your Kaalia list",
    packages: [
      {
        title: "Protect the First Attack",
        kicker: "Protection",
        body: "These are the cards that make Kaalia survive long enough to matter.",
        cards: ["Lightning Greaves", "Swiftfoot Boots", "Boros Charm", "Teferi's Protection", "Grand Abolisher"],
      },
      {
        title: "Cheat Targets That Matter",
        kicker: "Threats",
        body: "The best targets punish opponents immediately instead of merely adding a large body.",
        cards: ["Master of Cruelties", "Balefire Dragon", "Vilis, Broker of Blood", "Avacyn, Angel of Hope", "Razaketh, the Foulblooded"],
      },
      {
        title: "Cheap Answers",
        kicker: "Interaction",
        body: "Kaalia cannot spend whole turns answering one problem. Efficient removal keeps the attack plan live.",
        cards: ["Swords to Plowshares", "Path to Exile", "Anguished Unmaking", "Chaos Warp", "Disenchant"],
      },
      {
        title: "Keep Hands Castable",
        kicker: "Mana",
        body: "Acceleration and fixing prevent the deck from becoming a pile of stranded eight-drops.",
        cards: ["Sol Ring", "Arcane Signet", "Talisman of Conviction", "Talisman of Hierarchy", "Fellwar Stone"],
      },
    ],
    priorityTitle: "Upgrade Priority",
    priorities: [
      { step: "1", title: "Protect Kaalia first", body: "[[Lightning Greaves]], [[Swiftfoot Boots]], and [[Grand Abolisher]] make the first attack much more reliable." },
      { step: "2", title: "Use punishing targets", body: "[[Master of Cruelties]], [[Balefire Dragon]], and [[Vilis, Broker of Blood]] justify the risk immediately." },
      { step: "3", title: "Keep support cheap", body: "[[Swords to Plowshares]], [[Path to Exile]], and efficient rocks stop the deck from becoming uncastable top end." },
    ],
  },
};

export function getCommanderShowcase(
  slug: string,
  pageType: CommanderShowcasePageType
): CommanderLandingShowcaseContent | null {
  return SHOWCASES[key(slug, pageType)] ?? GENERATED_SHOWCASES[key(slug, pageType)] ?? null;
}
