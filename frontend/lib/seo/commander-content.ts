/**
 * Deterministic template-based content for Commander SEO pages.
 * No AI generation at build time - uses profile-aware templates and cached data.
 */

import type { CommanderProfile } from "@/lib/commanders";
import { COMMANDER_GUIDE_OVERRIDES } from "@/lib/seo/commander-guide-overrides";

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
  WUBR: "four-color",
  UBRG: "four-color",
  BRGW: "four-color",
  RGWU: "four-color",
  GWUB: "four-color",
  WUBRG: "five-color",
};

/** Format color identity for display (e.g. "Dimir", "five-color", "Mono-White") */
export function getColorLabel(colors: string[]): string {
  if (!colors?.length) return "colorless";
  if (colors.length === 5) return "WUBRG";
  if (colors.length === 1) {
    const c = GUILD_NAMES[colors[0]] ?? colors[0];
    return `Mono-${c.charAt(0).toUpperCase() + c.slice(1)}`;
  }
  const key = [...colors].sort().join("");
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

function formatTagLabel(tag: string): string {
  return tag
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function getThemeLabels(profile: CommanderProfile, limit = 3): string[] {
  return (profile.tags ?? []).filter(Boolean).slice(0, limit).map(formatTagLabel);
}

function getPlanLine(profile: CommanderProfile): string {
  const plan = profile.blurb?.trim();
  if (plan) return plan.endsWith(".") ? plan : `${plan}.`;
  const themes = getThemeLabels(profile);
  if (themes.length > 0) return `${profile.name} usually leans on ${humanList(themes).toLowerCase()} themes.`;
  return `${profile.name} rewards tight sequencing and role discipline in Commander.`;
}

function getCoachLine(profile: CommanderProfile): string {
  const notes = profile.coachNotes?.trim();
  if (notes) return notes.endsWith(".") ? notes : `${notes}.`;
  const themes = getThemeLabels(profile);
  if (themes.length > 0) {
    return `Most successful lists stay focused on ${humanList(themes).toLowerCase()} instead of drifting into generic filler.`;
  }
  return "The best builds stay disciplined on curve, interaction, and payoffs that actually support the commander.";
}

function getAvoidLine(profile: CommanderProfile): string {
  const avoid = (profile.avoid ?? []).filter(Boolean).slice(0, 3);
  if (avoid.length === 0) {
    return `Avoid hands or card slots that look powerful in a vacuum but do not help ${profile.name} execute its primary plan.`;
  }
  return `Common misses include ${humanList(avoid)}.`;
}

function getGuideOverride(profile: CommanderProfile) {
  return COMMANDER_GUIDE_OVERRIDES[profile.slug];
}

/** Render unique intro for commander hub */
export function renderCommanderIntro(
  profile: CommanderProfile,
  pageType: PageType = "hub"
): string {
  const override = getGuideOverride(profile);
  if (override) return override.intro;

  const { name, colors, tags, blurb } = profile;
  const colorLabel = colors?.length ? getColorLabel(colors) : "multicolor";
  const v = pickVariation(profile.slug, pageType);

  const openings = [
    `${name} is one of the most interesting commanders to tune in EDH.`,
    `Building a ${name} deck? Start by tightening the core game plan.`,
    `${name} brings a distinct Commander identity that rewards focused deckbuilding.`,
    `Whether you are tuning an existing ${name} list or starting from scratch, the right tools matter.`,
    `A ${name} deck gets much stronger once its early turns and payoff slots are aligned.`,
    `${name} stays popular because the shell can be powerful without feeling one-note.`,
    `From mulligan choices to budget upgrades, ${name} benefits from data-backed tuning.`,
    `${name} rewards careful sequencing, honest mulligan decisions, and disciplined card choices.`,
    `Optimizing ${name} starts with understanding what the deck is actually trying to do.`,
    `${name} Commander decks improve quickly when you separate glue cards from luxury cards.`,
  ];

  const colorPhrases = [
    `As a ${colorLabel} commander, ${name} gives you access to a broad range of support cards.`,
    `The ${colorLabel} color identity of ${name} shapes how your ramp, interaction, and payoffs line up.`,
    `${name}'s ${colorLabel} identity opens up several strong build paths without changing the core shell.`,
    `With ${colorLabel} in the command zone, ${name} can support both baseline staples and narrower synergy pieces.`,
  ];

  const blurbPhrases = blurb
    ? [
        `${blurb} Use the tools below to refine the list around that plan.`,
        `Core plan: ${blurb} These guides help you tighten the parts that matter most.`,
        `Strategic focus: ${blurb} ManaTap's tools help turn that into cleaner card choices.`,
      ]
    : [
        "Use the tools below to tune the shell and improve consistency.",
        "ManaTap's mulligan simulator, cost calculator, and budget swaps help optimize the list.",
        "These tools help you build a stronger, more consistent deck without guesswork.",
      ];

  const tagPhrase =
    tags?.length && v < 7
      ? `Common themes include ${getThemeLabels(profile).join(", ")}. `
      : "";

  const closings = [
    "Browse community decks, simulate mulligans, estimate costs, and find budget swaps in one place.",
    "Use the mulligan simulator for opener quality, Cost to Finish for spend planning, and Budget Swaps for cheaper replacements.",
    "ManaTap AI gives you practical Commander tools instead of generic deck advice.",
  ];

  return (
    openings[v % openings.length] +
    " " +
    (colors?.length ? colorPhrases[v % colorPhrases.length] + " " : "") +
    tagPhrase +
    blurbPhrases[v % blurbPhrases.length] +
    " " +
    closings[v % closings.length]
  );
}

/** Render mulligan guide intro paragraph */
export function renderMulliganIntro(profile: CommanderProfile): string {
  const themes = getThemeLabels(profile, 2);
  const themeText = themes.length > 0 ? ` around ${humanList(themes).toLowerCase()}` : "";
  return `Mulligan decisions with ${profile.name} start with role clarity: does your opener actually support a real ${profile.name} game plan${themeText}? ${getPlanLine(profile)} ${getCoachLine(profile)}`;
}

/** Render budget upgrades intro paragraph */
export function renderBudgetIntro(profile: CommanderProfile): string {
  const themes = getThemeLabels(profile, 3);
  const themeText = themes.length > 0 ? ` while keeping the ${humanList(themes).toLowerCase()} shell intact` : "";
  return `Budget upgrades for ${profile.name} work best when they improve consistency first and card quality second${themeText}. ${getPlanLine(profile)} ${getAvoidLine(profile)}`;
}

/** Render best cards intro paragraph */
export function renderBestCardsIntro(profile: CommanderProfile): string {
  const themes = getThemeLabels(profile, 3);
  const themeText = themes.length > 0 ? `${humanList(themes)} synergies` : "its core synergies";
  return `The best cards for ${profile.name} are the ones that cover your baseline Commander jobs without watering down ${themeText}. ${getPlanLine(profile)} ${getCoachLine(profile)}`;
}

/** Full mulligan guide content */
export function renderMulliganGuideContent(profile: CommanderProfile): Array<{ heading?: string; body: string }> {
  const { name } = profile;
  const override = getGuideOverride(profile);
  if (override) {
    return [
      { body: renderMulliganIntro(profile) },
      { heading: "What a keepable hand looks like", body: override.mulligan.keep },
      { heading: "When to ship a hand", body: override.mulligan.ship },
      { heading: "Your first three turns", body: override.mulligan.pattern },
      {
        body: `Ready to test real opener quality for ${name}? Run your own list through the ManaTap mulligan simulator, compare play versus draw, and check how often your opener actually lines up with the plan above.`,
      },
    ];
  }

  const themes = getThemeLabels(profile, 3);
  const openingPlan = (profile.flagship?.openingPlan ?? []).slice(0, 3);
  const intro = renderMulliganIntro(profile);

  const blocks = [
    {
      heading: "What a keepable hand looks like",
      body: `In Commander, the London mulligan gives you a free first reset and rewards disciplined keeps. For ${name}, a strong opener usually does three things at once: develops mana, offers an early spell or piece of interaction, and points toward your actual game plan. ${getPlanLine(profile)} If your seven has lands but no way to advance that plan, treat it as shakier than it first looks.`,
    },
    {
      heading: "Mana, colors, and early sequencing",
      body: `Most ${name} decks still want the normal Commander baseline of two to four lands or a hand that clearly replaces missing lands with reliable ramp. ${profile.colors?.length ? `${name} is ${getColorLabel(profile.colors)}, so your opener should cast your setup on time and not strand key colors in hand.` : "Your opener should cast its setup on time and not rely on perfect topdecks."} ${openingPlan.length > 0 ? `A solid early script often looks like ${humanList(openingPlan)}.` : getCoachLine(profile)}`,
    },
    {
      heading: "When to keep a borderline seven",
      body: `${themes.length > 0 ? `If your list is built around ${humanList(themes).toLowerCase()}, a borderline hand should still contain at least one card that matters for that package.` : "A borderline hand should still contain at least one card that matters for your engine."} Keep more aggressively when the hand has cheap setup plus enough mana to function. Ship more aggressively when it is all payoff, all air, or a pile of unrelated medium cards. ${getAvoidLine(profile)}`,
    },
    {
      heading: "Play vs draw",
      body: `On the draw, the extra card gives ${name} more room to keep a slower hand, especially one with two mana sources and a real early spell. On the play, be tougher on reactive hands that do nothing proactive until turn three. If your build is faster or more controlling than average, compare both modes in the simulator so your mulligan habits match the exact list you are piloting.`,
    },
    {
      body: `Ready to test real opener quality for ${name}? Run your own list through the ManaTap mulligan simulator, compare play versus draw, and check how often your opener actually lines up with the plan above.`,
    },
  ];

  return [{ body: intro }, ...blocks];
}

/** Full budget upgrades content */
export function renderBudgetUpgradesContent(profile: CommanderProfile): Array<{ heading?: string; body: string }> {
  const { name } = profile;
  const override = getGuideOverride(profile);
  if (override) {
    return [
      { body: renderBudgetIntro(profile) },
      { heading: "Buy consistency first", body: override.budget.first },
      { heading: "High-value budget adds", body: override.budget.cheap },
      { heading: "Premium upgrades worth saving for", body: override.budget.premium },
      {
        body: `Once you know which slots are underperforming, use Cost to Finish to see your real spend and Budget Swaps to lower it without tearing apart the shell that makes ${name} work.`,
      },
    ];
  }

  const themes = getThemeLabels(profile, 3);
  const upgradePriority = (profile.flagship?.upgradePriority ?? []).slice(0, 4);
  const intro = renderBudgetIntro(profile);

  const blocks = [
    {
      heading: "Upgrade the failures you notice most",
      body: `The best budget upgrades for ${name} start with whatever is losing games most often: shaky mana, weak card flow, poor interaction, or payoffs that never convert. ${themes.length > 0 ? `Because ${name} usually leans on ${humanList(themes).toLowerCase()}, spend first on cards that make that engine show up more consistently.` : "Spend first on cards that make your core engine show up more consistently."} ${upgradePriority.length > 0 ? `A practical order is ${humanList(upgradePriority)}.` : getCoachLine(profile)}`,
    },
    {
      heading: "Mana base upgrades",
      body: `For ${name}, mana upgrades usually outperform flashy spell swaps until the deck stops stumbling. Look for lands and rocks that cast your setup on time, not just your late-game bombs. Budget untapped sources, signets, talismans, and role-player rocks are often the highest-value purchases because they improve every game, not only your best draws. Cost to Finish helps you see whether your next dollars should go into lands, ramp, or payoffs first.`,
    },
    {
      heading: "Interaction and draw",
      body: `Cheap interaction and reliable draw are where budget decks quietly gain a lot of win percentage. In ${name}'s shell, prefer answers and draw engines that still support the main plan instead of generic filler that only looks efficient. ${getAvoidLine(profile)} Budget swaps work best when you replace a card by role first and by price second.`,
    },
    {
      heading: "Use swaps without weakening the deck",
      body: `Paste your list into the budget swap tool and set a threshold that matches how you actually buy cards, such as every card over $5 or over $15. Then pressure-test each suggestion by asking whether it still advances ${name}'s plan and whether it keeps the same timing on your curve. That is the difference between saving money and quietly making the deck clunkier.`,
    },
    {
      body: `Once you know which slots are underperforming, use Cost to Finish to see your real spend and Budget Swaps to lower it without tearing apart the shell that makes ${name} work.`,
    },
  ];

  return [{ body: intro }, ...blocks];
}

/** Full best cards content (role-based framework, no hallucinated card lists) */
export function renderBestCardsContent(profile: CommanderProfile): Array<{ heading?: string; body: string }> {
  const { name } = profile;
  const override = getGuideOverride(profile);
  if (override) {
    return [
      { body: renderBestCardsIntro(profile) },
      { heading: "Core engine cards", body: override.bestCards.engines },
      { heading: "Interaction that actually earns slots", body: override.bestCards.interaction },
      { heading: "How the deck really closes", body: override.bestCards.finishers },
      {
        body: `Use the tracked staples below as a reality check, then compare them against your own list in ManaTap's deck tools to see where your build is missing glue pieces, interaction, or actual closers.`,
      },
    ];
  }

  const themes = getThemeLabels(profile, 3);
  const intro = renderBestCardsIntro(profile);

  const blocks = [
    {
      heading: "Start with jobs, not hype",
      body: `Every ${name} deck still needs the usual Commander jobs: ramp, card draw, interaction, and finishers. The best inclusions are the ones that pull double duty by also supporting ${name}'s engine. ${themes.length > 0 ? `If a card helps your ${humanList(themes).toLowerCase()} plan while covering a baseline role, that is exactly the kind of slot efficiency you want.` : "If a card helps your engine while covering a baseline role, that is exactly the kind of slot efficiency you want."}`,
    },
    {
      heading: "Ramp and mana",
      body: `Ramp is best when it fixes the turns that matter most. If ${name} wants to commit early setup, prioritize cheap acceleration that lets you deploy that setup on curve. If the list is heavier, bias toward ramp that jumps you cleanly into your commander and first payoff turn. Do not just count ramp pieces; look at whether they actually bridge your most important turns.`,
    },
    {
      heading: "Draw and card advantage",
      body: `Card draw in ${name} should usually reward what the deck was already trying to do. Repeatable engines that trigger off your primary actions tend to outperform random value spells over a long multiplayer game. Mix cheap smoothing with a few cards that can pull you back from an empty hand after the first wave of threats trades off.`,
    },
    {
      heading: "Removal and interaction",
      body: `Interaction is where a lot of Commander lists get lazy. ${name} wants answers that keep you alive without forcing you to abandon your own plan for multiple turns. Instant-speed spot removal, stack interaction where available, and a realistic number of reset buttons matter more than loading up on slow haymakers that never line up in time.`,
    },
    {
      heading: "Synergy payoffs",
      body: `Once the foundation is covered, use the remaining slots on cards that make ${name} feel unfair when it is working. Those are your real synergy payoffs: tribal enablers, combo bridges, burst-damage pieces, recursion loops, or value engines that convert your commander's text into a closing plan. ${getAvoidLine(profile)} Browse ManaTap's tracked ${name} decks to spot the cards strong pilots keep coming back to.`,
    },
    {
      body: `Use the tracked staples below as a reality check, then compare them against your own list in ManaTap's deck tools to see where your build is missing glue pieces, interaction, or actual closers.`,
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
  if (tagSet.has("aggro") || tagSet.has("tokens") || tagSet.has("goblins") || tagSet.has("dinosaurs")) {
    powerStyle = "Aggro";
  } else if (tagSet.has("control") || tagSet.has("stax")) {
    powerStyle = "Control";
  } else if (tagSet.has("combo") || tagSet.has("cascade")) {
    powerStyle = "Combo";
  }

  let difficulty: CommanderSnapshot["difficulty"] = "Intermediate";
  const colorCount = colors?.length ?? 0;
  if (colorCount >= 5 || tagSet.has("combo")) difficulty = "Advanced";
  else if (colorCount <= 2 && !tagSet.has("combo")) difficulty = "Easy";

  return { gameplan, themes, powerStyle, difficulty };
}

/** How this deck wins - template for content thickness */
export function renderHowDeckWins(profile: CommanderProfile): string {
  const override = getGuideOverride(profile);
  if (override) return override.howWins;

  const { name } = profile;
  const snapshot = deriveCommanderSnapshot(profile);
  const v = pickVariation(profile.slug, "how-wins");
  const templates = [
    `${name} decks typically win through ${snapshot.powerStyle.toLowerCase()} lines: building pressure, out-valuing opponents, or closing with a decisive combat or combo turn. The ${snapshot.themes} shell supports that plan.`,
    `How ${name} wins: ${snapshot.gameplan}. Most builds use ${snapshot.themes} to generate pressure, value, or a closing sequence before the table stabilizes.`,
    `${name} closes games by capitalizing on ${snapshot.themes}. The ${snapshot.powerStyle} angle means you are usually pressuring early, controlling the pace, or assembling a clean finish.`,
  ];
  return templates[v % templates.length];
}

/** Common mistakes - template for content thickness */
export function renderCommonMistakes(profile: CommanderProfile): string {
  const override = getGuideOverride(profile);
  if (override) return override.mistakes;

  const { name } = profile;
  const v = pickVariation(profile.slug, "mistakes");
  const avoidLine = getAvoidLine(profile);
  const templates = [
    `Common mistakes with ${name}: skimping on ramp, running too many expensive payoffs without setup, and neglecting interaction. ${avoidLine}`,
    `Avoid these ${name} pitfalls: too few lands or ramp, cutting interaction for more "fun" cards, and overcommitting before you can protect your board. ${avoidLine}`,
    `When building ${name}, do not forget ramp, card draw, and removal. Many lists fail by running too many payoff cards and not enough setup. ${avoidLine}`,
  ];
  return templates[v % templates.length];
}

/** Strategy Snapshot: 2-3 sentence SSR summary from template */
export function renderStrategySnapshot(profile: CommanderProfile): string {
  const { name } = profile;
  const snapshot = deriveCommanderSnapshot(profile);
  const v = pickVariation(profile.slug, "hub");
  const templates = [
    `${name} favors a ${snapshot.powerStyle.toLowerCase()} playstyle with ${snapshot.themes} themes. ${snapshot.gameplan}. This build is typically ${snapshot.difficulty.toLowerCase()} to pilot.`,
    `${name} decks commonly focus on ${snapshot.themes}. The game plan centers on ${snapshot.gameplan}. Expect a ${snapshot.difficulty.toLowerCase()}-difficulty deck with ${snapshot.powerStyle} elements.`,
    `A ${snapshot.powerStyle} commander, ${name} rewards ${snapshot.themes}-oriented builds. ${snapshot.gameplan}. Suitable for ${snapshot.difficulty.toLowerCase()} players.`,
  ];
  return templates[v % templates.length];
}

/** FAQ for best cards */
export const BEST_CARDS_FAQ = [
  { q: "What roles should every Commander deck fill?", a: "Ramp, card draw, removal, and win conditions. Cover these before adding niche synergies." },
  { q: "How many ramp pieces do I need?", a: "Most Commander decks run 8-12 ramp effects. Lower curves need less; higher curves need more." },
  { q: "What counts as card draw?", a: "Any effect that puts cards into your hand. One-off draw is fine, but repeatable engines scale better." },
  { q: "How do I find cards for my commander?", a: "Browse ManaTap's public decks, use the deck checker, or try the AI assistant for suggestions." },
  { q: "Should I include combos?", a: "That depends on your playgroup. Combo is viable; ensure you have tutors or redundancy if you go that route." },
];
