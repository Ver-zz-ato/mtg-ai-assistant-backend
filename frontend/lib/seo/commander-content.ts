/**
 * Deterministic template-based content for Commander SEO pages.
 * No AI generation at build time — uses varied sentence templates.
 */

import type { CommanderProfile } from "@/lib/commanders";

const GUILD_NAMES: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
  WU: "Azorius",
  UB: "Dimir",
  BR: "Rakdos",
  RG: "Gruul",
  GW: "Selesnya",
  WB: "Orzhov",
  UR: "Izzet",
  BG: "Golgari",
  RW: "Boros",
  GU: "Simic",
  WUB: "Esper",
  UBR: "Grixis",
  BRG: "Jund",
  RGW: "Naya",
  GWU: "Bant",
  WBR: "Mardu",
  URG: "Temur",
  BGW: "Abzan",
  RWU: "Jeskai",
  GUB: "Sultai",
  WUBR: "no name",
  UBRG: "no name",
  BRGW: "no name",
  RGWU: "no name",
  GWUB: "no name",
  WUBRG: "five-color",
};

function getColorLabel(colors: string[]): string {
  if (!colors?.length) return "colorless";
  if (colors.length === 5) return "five-color";
  const key = colors.sort().join("");
  return GUILD_NAMES[key] ?? colors.map((c) => GUILD_NAMES[c] ?? c).join("-");
}

/** Simple hash for deterministic variation selection */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Pick template index from slug + pageType */
function pickVariation(slug: string, pageType: string): number {
  return hash(slug + pageType) % 10;
}

export type PageType = "hub" | "mulligan-guide" | "budget-upgrades" | "best-cards";

/** Render unique intro for commander hub (200–350 words) */
export function renderCommanderIntro(
  profile: CommanderProfile,
  pageType: PageType = "hub"
): string {
  const { name, colors, tags, blurb } = profile;
  const colorLabel = colors?.length ? getColorLabel(colors) : "multicolor";
  const v = pickVariation(profile.slug, pageType);

  const openings = [
    `${name} is one of the most popular Commanders in EDH.`,
    `Building a ${name} deck? Here's how to get the most out of your list.`,
    `${name} brings a unique strategy to the Commander table.`,
    `Whether you're tuning an existing ${name} list or building from scratch, these tools help.`,
    `A ${name} deck thrives when you optimize its core pieces.`,
    `${name} has become a Commander staple for good reason.`,
    `From mulligan decisions to budget upgrades, ${name} decks benefit from data-driven choices.`,
    `${name} rewards careful deck construction and smart opening hands.`,
    `Optimizing your ${name} list starts with understanding its strengths.`,
    `${name} Commander decks get better with the right tools and guides.`,
  ];

  const colorPhrases = [
    `As a ${colorLabel} commander, ${name} opens up a wide range of card options.`,
    `The ${colorLabel} color identity of ${name} supports flexible strategies.`,
    `${name}'s ${colorLabel} identity allows for powerful synergies.`,
    `With ${colorLabel} in the command zone, ${name} enables diverse builds.`,
    `The ${colorLabel} color pie gives ${name} access to key effects.`,
    `${name} leverages ${colorLabel} mana for a strong game plan.`,
    `A ${colorLabel} commander like ${name} offers plenty of build flexibility.`,
    `${name} uses ${colorLabel} colors to support its core strategy.`,
    `The ${colorLabel} identity of ${name} shapes your deck's options.`,
    `${name} in ${colorLabel} supports a variety of archetypes.`,
  ];

  const blurbPhrases = blurb
    ? [
        `${blurb} Use the tools below to refine your build.`,
        `Strategic focus: ${blurb} ManaTap's tools help you stay on plan.`,
        `Core plan: ${blurb} These guides and calculators support that strategy.`,
      ]
    : [
        "Use the tools below to tune your deck and improve consistency.",
        "ManaTap's mulligan simulator, cost calculator, and budget swaps help optimize your list.",
        "These free tools help you build a stronger, more consistent deck.",
      ];

  const tagPhrase =
    tags?.length && v < 6
      ? `Common themes include ${tags.slice(0, 3).join(", ")}. `
      : "";

  const closings = [
    "Browse community decks, simulate mulligans, estimate costs, and find budget swaps — all in one place.",
    "Try the mulligan simulator to see keep rates, the cost-to-finish calculator for budget planning, and budget swaps for cheaper alternatives.",
    "ManaTap AI offers free tools for mulligan odds, deck cost, and budget card suggestions.",
  ];

  const intro =
    openings[v % openings.length] +
    " " +
    (colors?.length ? colorPhrases[v % colorPhrases.length] + " " : "") +
    tagPhrase +
    blurbPhrases[v % blurbPhrases.length] +
    " " +
    closings[v % closings.length];

  return intro;
}

/** Render mulligan guide intro paragraph */
export function renderMulliganIntro(profile: CommanderProfile): string {
  const v = pickVariation(profile.slug, "mulligan-guide");
  const templates = [
    `Knowing when to keep or mulligan is crucial for ${profile.name} decks. A bad opener can set you back several turns, while a well-tuned hand sets up your game plan.`,
    `Mulligan decisions with ${profile.name} depend on your deck's curve, key cards, and mana requirements. This guide covers practical heuristics for Commander.`,
    `The London mulligan and Commander's free first mulligan give ${profile.name} pilots flexibility. Use these rules to evaluate your opening hands.`,
    `Whether you're playing ${profile.name} as a fast combo deck or a slower value engine, mulligan strategy matters. Here's how to decide.`,
    `Opening hands with ${profile.name} should support your deck's primary plan. Learn the general rules, then apply them to your list.`,
  ];
  return templates[v % templates.length];
}

/** Render budget upgrades intro paragraph */
export function renderBudgetIntro(profile: CommanderProfile): string {
  const v = pickVariation(profile.slug, "budget-upgrades");
  const templates = [
    `Upgrading a ${profile.name} deck on a budget means finding the right replacements. Mana base, interaction, draw, and wincons are the main levers.`,
    `Budget upgrades for ${profile.name} focus on the same categories as any deck: lands, removal, card draw, and payoff cards. Here's how to prioritize.`,
    `Whether you're upgrading a precon or tuning a ${profile.name} list, budget swaps help. This guide covers the most common upgrade paths.`,
    `The best budget upgrades for ${profile.name} hit key slots: mana fixing, interaction, and synergistic payoffs. ManaTap's tools make it easy.`,
    `Upgrading ${profile.name} on a budget doesn't mean sacrificing power. Focus on high-impact slots and use ManaTap's swap suggestions.`,
  ];
  return templates[v % templates.length];
}

/** Render best cards intro paragraph */
export function renderBestCardsIntro(profile: CommanderProfile): string {
  const v = pickVariation(profile.slug, "best-cards");
  const templates = [
    `Choosing the best cards for ${profile.name} starts with understanding role categories: ramp, draw, removal, and synergy payoffs.`,
    `A strong ${profile.name} deck fills core roles before adding niche synergies. Ramp, draw, and removal form the foundation.`,
    `The best cards for ${profile.name} depend on your build's focus. This guide provides a framework for slotting cards by role.`,
    `Building a ${profile.name} list? Prioritize ramp, draw, and removal, then add payoff cards that match your commander's strategy.`,
    `Card selection for ${profile.name} follows a role-based approach. Cover your bases first, then add synergistic payoffs.`,
  ];
  return templates[v % templates.length];
}

/** Full mulligan guide content (600–1200 words) — returns array of { heading?, body } */
export function renderMulliganGuideContent(profile: CommanderProfile): Array<{ heading?: string; body: string }> {
  const { name } = profile;
  const intro = renderMulliganIntro(profile);
  const blocks = [
    {
      heading: "Commander-agnostic mulligan rules",
      body: `In Commander, the London mulligan lets you put any number of cards on the bottom of your library and draw back up to seven. Your first mulligan is free — you don't lose a card. Most ${name} decks benefit from a hand that can cast the commander on curve, hits enough lands (typically two or three in the opener), and has at least one early play. If your hand has zero or one land, ship it. If it has seven lands and no action, ship it. Hands that are all ramp with no payoff, or all payoff with no mana, usually deserve a mulligan.`,
    },
    {
      heading: "Lands and mana requirements",
      body: `A typical ${name} deck runs 33–37 lands. For your opener, aim for two to four lands depending on your curve. Low-curve ${name} builds might keep two-land hands if they have a one-drop or two-drop. Higher-curve lists want three or four lands. If your commander costs four or more mana, ensure you have a path to cast it by turn four or five. Color requirements matter: if ${name} needs specific colors early, keep hands that can produce them.`,
    },
    {
      heading: "When to keep marginal hands",
      body: `Sometimes a hand is borderline — two lands, a ramp spell, and a couple of mid-game cards. With ${name}, consider whether the hand supports your primary plan. If your deck wants to go fast, keep hands that pressure early. If it's a value engine, keep hands that set up card draw or recursion. After a free mulligan, you might keep a slightly worse seven than you would at six cards. Use the ManaTap mulligan simulator to see keep rates for your specific deck configuration.`,
    },
    {
      heading: "Play vs draw",
      body: `On the draw, you get one extra card before the game starts. That improves your odds of hitting land drops and key spells. When testing mulligans, toggle play vs draw in the simulator to see how it affects your keep rate. On the draw, you can sometimes keep a two-land hand that you'd ship on the play.`,
    },
    {
      body: `Ready to see keep rates for your ${name} list? Use the ManaTap mulligan simulator — paste your decklist or load a deck, set your parameters, and run thousands of simulations.`,
    },
  ];
  return [{ body: intro }, ...blocks];
}

/** Full budget upgrades content */
export function renderBudgetUpgradesContent(profile: CommanderProfile): Array<{ heading?: string; body: string }> {
  const { name } = profile;
  const intro = renderBudgetIntro(profile);
  const blocks = [
    {
      heading: "Most common upgrade categories",
      body: `The four main levers for upgrading any Commander deck — including ${name} — are mana base, interaction, card draw, and win conditions. Mana base upgrades (better duals, fetches, ramp) improve consistency. Interaction upgrades (e.g., cheap removal, counterspells) help you answer threats. Draw upgrades keep your hand full. Wincon upgrades close games faster. Prioritize based on your deck's weaknesses: if you flood or screw, fix the mana. If you run out of gas, add draw. If you can't close, add payoffs.`,
    },
    {
      heading: "Mana base upgrades",
      body: `For ${name}, mana base upgrades usually mean adding lands that enter untapped and produce your colors. Budget options include pain lands, check lands, and the newer dual cycles. Avoid lands that always enter tapped unless they provide significant value. Mana rocks like Arcane Signet and Mind Stone are cheap and effective. The ManaTap cost-to-finish calculator shows exactly how much you need to spend to complete your list — and you can subtract cards you already own.`,
    },
    {
      heading: "Interaction and draw",
      body: `Cheap removal and card draw are high-impact upgrades. In ${name}'s colors, look for efficient instant-speed answers and draw engines that fit your strategy. Budget swaps often replace expensive staples with functional alternatives. ManaTap's budget swap tool finds cheaper cards that do similar jobs — Pro users get AI-powered suggestions that maintain deck synergy.`,
    },
    {
      heading: "How ManaTap budget swaps works",
      body: `Paste your decklist into the budget swap tool and set a price threshold (e.g., replace any card over $5). The tool suggests cheaper alternatives. Quick Swaps uses a curated list of substitutes. AI-Powered Swaps (Pro) analyzes your deck's strategy and finds cards that fit the same role while keeping synergy. Use the cost-to-finish calculator first to see total deck cost, then use budget swaps to bring it down.`,
    },
    {
      body: `Ready to upgrade your ${name} deck? Try the ManaTap cost-to-finish calculator and budget swap tool.`,
    },
  ];
  return [{ body: intro }, ...blocks];
}

/** Full best cards content (role-based framework, no hallucinated card lists) */
export function renderBestCardsContent(profile: CommanderProfile): Array<{ heading?: string; body: string }> {
  const { name } = profile;
  const intro = renderBestCardsIntro(profile);
  const blocks = [
    {
      heading: "Card role frameworks",
      body: `Every Commander deck needs ramp, draw, removal, and win conditions. For ${name}, choose cards that fill these roles while supporting your commander's strategy. Ramp slots: mana dorks, rocks, and land-based ramp. Draw slots: engines that reward your deck's primary actions (e.g., playing creatures, casting spells). Removal: spot removal and board wipes that fit your colors. Wincons: cards that close games — combat, combo, or incremental value.`,
    },
    {
      heading: "Ramp and mana",
      body: `Ramp gets you to ${name} and your payoffs faster. In green, land ramp is staple. In nongreen colors, artifact ramp (Sol Ring, Signets, etc.) fills the gap. Match ramp density to your curve: lower curves need less ramp; higher curves need more. Include mana rocks that produce your commander's colors.`,
    },
    {
      heading: "Draw and card advantage",
      body: `Card draw keeps your hand full. One-off draw spells are fine, but repeatable engines (e.g., "whenever you do X, draw") scale better in multiplayer. For ${name}, prioritize draw that triggers off your deck's main actions. Consider both early cantrips and late-game refills.`,
    },
    {
      heading: "Removal and interaction",
      body: `Removal answers threats. Spot removal handles single targets; board wipes reset the board. Balance both. Instant-speed removal is preferred so you can hold mana and react. In ${name}'s colors, choose removal that hits the permanent types you expect to face.`,
    },
    {
      heading: "Synergy payoffs",
      body: `After filling core roles, add payoff cards that synergize with ${name}. These might reward your commander's triggered abilities, support a tribal theme, or enable a combo. Avoid generic "good stuff" that doesn't advance your plan. Browse ManaTap's public ${name} decks for inspiration, then use the deck builder and analyzer to refine your list.`,
    },
    {
      body: `Build and analyze your ${name} deck with ManaTap AI. Browse community decks, paste your list for analysis, and get personalized suggestions.`,
    },
  ];
  return [{ body: intro }, ...blocks];
}

/** FAQ for mulligan guide */
export const MULLIGAN_FAQ = [
  { q: "What is the London mulligan?", a: "You put any number of cards from your hand on the bottom of your library, then draw back up to seven. In Commander, your first mulligan is free." },
  { q: "How many lands should I keep?", a: "Most Commander decks want two to four lands in the opener. Low-curve decks can keep two; higher curves want three or four." },
  { q: "Should I mulligan a hand with no ramp?", a: "It depends on your curve. If your deck needs early ramp to function, ship hands without it. If you have enough lands and cheap plays, you might keep." },
  { q: "Does play vs draw affect mulligan strategy?", a: "Yes. On the draw you get an extra card, so you can sometimes keep slightly weaker hands." },
  { q: "How can I test my mulligan strategy?", a: "Use the ManaTap mulligan simulator. Paste your decklist, set parameters, and run thousands of simulations to see keep rates." },
];

/** FAQ for budget upgrades */
export const BUDGET_FAQ = [
  { q: "What are the best budget upgrades?", a: "Mana base, interaction, and card draw usually have the highest impact. Fix consistency first, then add power." },
  { q: "How does the cost-to-finish calculator work?", a: "Paste a decklist and see the total cost. Subtract cards you own from a selected collection to get your true cost to finish." },
  { q: "What is ManaTap's budget swap tool?", a: "It finds cheaper alternatives for expensive cards. Set a price threshold and get suggestions. Pro users get AI-powered swaps that maintain synergy." },
  { q: "Should I upgrade lands or spells first?", a: "Lands improve consistency most. If you're stumbling on mana, prioritize lands. If you're stable, upgrade interaction and draw." },
  { q: "Can I use budget swaps for any deck?", a: "Yes. Paste any decklist from Moxfield, Archidekt, or plain text. The tool works without an account." },
];

/** Derive snapshot fields from commander profile (SSR, deterministic) */
export type CommanderSnapshot = {
  gameplan: string;
  themes: string;
  powerStyle: "Aggro" | "Control" | "Combo" | "Value";
  difficulty: "Easy" | "Intermediate" | "Advanced";
};

export function deriveCommanderSnapshot(profile: CommanderProfile): CommanderSnapshot {
  const { colors, tags, blurb } = profile;
  const tagSet = new Set((tags ?? []).map((t) => t.toLowerCase()));

  const gameplan =
    blurb?.split(/[.!]/)[0]?.trim() ||
    (tags?.length ? `${tags.slice(0, 2).join(", ")}-centric build` : "Flexible EDH strategy");

  const themes =
    tags?.slice(0, 4).join(", ") ||
    (colors?.length ? `multicolor (${colors.length} colors)` : "general");

  let powerStyle: CommanderSnapshot["powerStyle"] = "Value";
  if (tagSet.has("aggro") || tagSet.has("tokens") || tagSet.has("goblins") || tagSet.has("dinosaurs"))
    powerStyle = "Aggro";
  else if (tagSet.has("control") || tagSet.has("stax")) powerStyle = "Control";
  else if (tagSet.has("combo") || tagSet.has("cascade")) powerStyle = "Combo";

  let difficulty: CommanderSnapshot["difficulty"] = "Intermediate";
  const colorCount = colors?.length ?? 0;
  if (colorCount >= 5 || tagSet.has("combo")) difficulty = "Advanced";
  else if (colorCount <= 2 && !tagSet.has("combo")) difficulty = "Easy";

  return { gameplan, themes, powerStyle, difficulty };
}

/** Strategy Snapshot: 2–3 sentence SSR summary from template */
export function renderStrategySnapshot(profile: CommanderProfile): string {
  const { name } = profile;
  const snapshot = deriveCommanderSnapshot(profile);
  const v = pickVariation(profile.slug, "hub");
  const templates = [
    `${name} favors a ${snapshot.powerStyle.toLowerCase()} playstyle with ${snapshot.themes} themes. ${snapshot.gameplan}. This build is typically ${snapshot.difficulty.toLowerCase()} to pilot.`,
    `${name} decks commonly focus on ${snapshot.themes}. The gameplan centers on ${snapshot.gameplan}. Expect a ${snapshot.difficulty.toLowerCase()}-difficulty deck with ${snapshot.powerStyle} elements.`,
    `A ${snapshot.powerStyle} commander, ${name} rewards ${snapshot.themes}-oriented builds. ${snapshot.gameplan}. Suitable for ${snapshot.difficulty.toLowerCase()} players.`,
  ];
  return templates[v % templates.length];
}

/** FAQ for best cards */
export const BEST_CARDS_FAQ = [
  { q: "What roles should every Commander deck fill?", a: "Ramp, card draw, removal, and win conditions. Cover these before adding niche synergies." },
  { q: "How many ramp pieces do I need?", a: "Most Commander decks run 8–12 ramp effects. Lower curves need less; higher curves need more." },
  { q: "What counts as card draw?", a: "Any effect that puts cards into your hand. One-off draw is fine, but repeatable engines scale better." },
  { q: "How do I find cards for my commander?", a: "Browse ManaTap's public decks, use the deck analyzer, or try the AI assistant for suggestions." },
  { q: "Should I include combos?", a: "That depends on your playgroup. Combo is viable; ensure you have tutors or redundancy if you go that route." },
];
