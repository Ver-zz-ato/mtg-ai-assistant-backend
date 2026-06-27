"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Coins, Flame, Gem, Layers, Shield, Sparkles, Swords, Target, Trophy, Zap } from "lucide-react";
import {
  QUIZ_QUESTIONS,
  calculateProfile,
  computeTraits,
  getTraitLabel,
  type PlaystyleProfile,
  type PlaystyleTraits,
} from "@/lib/quiz/quiz-data";
import { getCommanderSuggestionsWithMatch, getArchetypeSuggestionsWithMatch } from "@/lib/quiz/commander-suggestions";
import {
  deriveConstructedArchetypeFromQuizAnswers,
  deriveConstructedBudgetFromQuizAnswers,
  deriveConstructedDirectionFromQuizAnswers,
  deriveConstructedPowerFromQuizAnswers,
  deriveConstructedProfileLabel,
  getConstructedQuizQuestions,
  type ConstructedFormat,
} from "@/lib/build/collectionConstructedPayload";
import { saveBuildDeckHandoff } from "@/lib/build/buildDeckHandoff";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";

type QuizFormat = AnalyzeFormat;

type CardImage = { small?: string; normal?: string; art_crop?: string };
type ConstructedTraitKey = "speed" | "interaction" | "synergy" | "resilience" | "metaSafety" | "budgetFit" | "complexity";
type ConstructedTraits = Record<ConstructedTraitKey, number>;
type ConstructedRecommendation = {
  id: string;
  title: string;
  subtitle: string;
  colors: string[];
  archetype: string;
  matchPct: number;
  role: string;
  plan: string[];
  exampleCards: string[];
  sideboard: string[];
};

const FORMATS: Array<{ id: QuizFormat; label: string; sub: string; art: string; accent: string }> = [
  { id: "Commander", label: "Commander", sub: "Commander suggestions and 100-card handoff", art: "/format-pill-backgrounds/commander-pill-background.png", accent: "from-purple-500/35" },
  { id: "Modern", label: "Modern", sub: "Fast 60-card constructed", art: "/format-pill-backgrounds/modern-pill-background.png", accent: "from-orange-500/35" },
  { id: "Pioneer", label: "Pioneer", sub: "Non-rotating 60-card constructed", art: "/format-pill-backgrounds/pioneer-pill-background.png", accent: "from-emerald-500/35" },
  { id: "Standard", label: "Standard", sub: "Rotating 60-card constructed", art: "/format-pill-backgrounds/standard-pill-background.png", accent: "from-sky-500/35" },
  { id: "Pauper", label: "Pauper", sub: "Commons-focused 60-card constructed", art: "/format-pill-backgrounds/pauper-pill-background.png", accent: "from-fuchsia-500/35" },
];

const ANSWER_STYLES = [
  { icon: Flame, className: "border-orange-400/35 bg-orange-500/10 hover:border-orange-300/80 hover:bg-orange-500/18 text-orange-100" },
  { icon: Shield, className: "border-sky-400/35 bg-sky-500/10 hover:border-sky-300/80 hover:bg-sky-500/18 text-sky-100" },
  { icon: Sparkles, className: "border-violet-400/35 bg-violet-500/10 hover:border-violet-300/80 hover:bg-violet-500/18 text-violet-100" },
  { icon: Swords, className: "border-red-400/35 bg-red-500/10 hover:border-red-300/80 hover:bg-red-500/18 text-red-100" },
  { icon: Coins, className: "border-amber-300/35 bg-amber-300/10 hover:border-amber-200/80 hover:bg-amber-300/18 text-amber-100" },
  { icon: Gem, className: "border-emerald-400/35 bg-emerald-500/10 hover:border-emerald-300/80 hover:bg-emerald-500/18 text-emerald-100" },
  { icon: Brain, className: "border-cyan-400/35 bg-cyan-500/10 hover:border-cyan-300/80 hover:bg-cyan-500/18 text-cyan-100" },
] as const;

function isConstructed(format: QuizFormat): format is ConstructedFormat {
  return format !== "Commander";
}

function colorsForConstructed(format: ConstructedFormat, answers: Record<string, string>): string[] {
  const theme = answers.theme;
  const pace = answers.pace;
  if (theme === "spells") return ["U", "R"];
  if (theme === "tokens") return ["W", "G"];
  if (theme === "graveyard") return ["B", "G"];
  if (theme === "artifacts") return ["U", "R"];
  if (theme === "enchantments") return ["W", "G"];
  if (pace === "control") return ["W", "U"];
  if (pace === "combo") return ["U", "B"];
  if (pace === "aggro") return format === "Pauper" ? ["R"] : ["R", "W"];
  return ["B", "G"];
}

function explainConstructed(answers: Record<string, string>) {
  const pace = answers.pace || "value";
  const theme = answers.theme || "midrange";
  const avoid = answers.avoid ? `Avoid ${humanizeConstructedAnswer(answers.avoid)}.` : "";
  return `Quiz result: ${humanizeConstructedAnswer(pace)} pace, ${humanizeConstructedAnswer(theme)} shell. ${avoid}`.trim();
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampPct(value: number) {
  return Math.max(5, Math.min(100, Math.round(value)));
}

function humanizeConstructedAnswer(value: string) {
  const labels: Record<string, string> = {
    aggro: "early pressure",
    control: "control",
    combo: "combo",
    value: "value",
    budget: "budget-friendly",
    mid: "balanced",
    premium: "premium",
    solo: "proactive",
    moderate: "moderately interactive",
    heavy: "heavy interaction",
    chaos: "swingy",
    simple: "simple",
    medium: "medium-complexity",
    complex: "complex",
    creatures: "creature pressure",
    spells: "spells",
    tokens: "tokens",
    graveyard: "graveyard",
    artifacts: "artifacts",
    enchantments: "enchantments",
    draw_go: "pure draw-go",
    creature_combat: "creature combat only",
    mana_greed: "greedy mana",
    expensive_staples: "expensive staple piles",
    meta_safe: "meta-safe",
    proven_twist: "proven with a twist",
    rogue_coherent: "rogue but coherent",
  };
  return labels[value] || value.replace(/_/g, " ");
}

function colorName(colors: string[]) {
  const key = [...colors].sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b)).join("");
  const names: Record<string, string> = {
    W: "Mono-White",
    U: "Mono-Blue",
    B: "Mono-Black",
    R: "Mono-Red",
    G: "Mono-Green",
    WU: "Azorius",
    WB: "Orzhov",
    WR: "Boros",
    WG: "Selesnya",
    UB: "Dimir",
    UR: "Izzet",
    UG: "Simic",
    BR: "Rakdos",
    BG: "Golgari",
    RG: "Gruul",
  };
  return names[key] || (key ? key : "Open-Color");
}

function constructedArchetypeName(format: ConstructedFormat, answers: Record<string, string>, colors: string[]) {
  const pace = answers.pace;
  const theme = answers.theme;
  const guild = colorName(colors);
  if (theme === "spells") return format === "Pauper" ? `${guild} Terror Spells` : `${guild} Spells Tempo`;
  if (theme === "tokens") return `${guild} Tokens`;
  if (theme === "graveyard") return `${guild} Graveyard Value`;
  if (theme === "artifacts") return format === "Pauper" ? `${guild} Affinity` : `${guild} Artifacts`;
  if (theme === "enchantments") return `${guild} Enchantments`;
  if (pace === "aggro") return format === "Pauper" ? `${guild} Aggro` : `${guild} Tempo Aggro`;
  if (pace === "control") return `${guild} Control`;
  if (pace === "combo") return `${guild} Combo`;
  return `${guild} Midrange`;
}

function constructedProfileDescription(format: ConstructedFormat, answers: Record<string, string>, title: string) {
  const pace = answers.pace;
  const interaction = answers.interaction;
  if (pace === "control") {
    return `${title} is a ${format} plan that trades resources early, protects its life total, and wins once the opponent is out of clean pressure.`;
  }
  if (pace === "aggro") {
    return `${title} is a ${format} plan for pressuring early while keeping just enough disruption to stop the opponent stabilising.`;
  }
  if (pace === "combo") {
    return `${title} is a ${format} plan that trims distractions, protects a compact finish, and knows which hands actually assemble a kill.`;
  }
  if (answers.theme === "graveyard") {
    return `${title} uses the graveyard as a second hand, but still needs resilient threats so hate cards do not end the game on the spot.`;
  }
  if (interaction === "heavy") {
    return `${title} leans interactive: cheap answers, flexible threats, and sideboard cards that let you play real games after turn one.`;
  }
  return `${title} is a coherent ${format} shell with enough pressure, card advantage, and sideboard texture to become a real 60-card list.`;
}

function deriveConstructedTraits(answers: Record<string, string>): ConstructedTraits {
  const pace = answers.pace;
  const interaction = answers.interaction;
  const complexity = answers.complexity;
  const metagame = answers.metagame;
  const budget = answers.budget;
  const synergyTheme = ["spells", "tokens", "graveyard", "artifacts", "enchantments"].includes(answers.theme || "");

  return {
    speed: clampPct(pace === "aggro" ? 88 : pace === "combo" ? 68 : pace === "control" ? 38 : 56),
    interaction: clampPct((interaction === "heavy" ? 90 : interaction === "moderate" ? 64 : interaction === "chaos" ? 48 : 34) + (pace === "control" ? 8 : 0)),
    synergy: clampPct((synergyTheme ? 82 : pace === "combo" ? 88 : 58) + (complexity === "complex" ? 8 : 0)),
    resilience: clampPct((pace === "control" || pace === "value" ? 78 : pace === "aggro" ? 52 : 64) + (metagame === "meta_safe" ? 8 : 0)),
    metaSafety: clampPct(metagame === "meta_safe" ? 88 : metagame === "proven_twist" ? 74 : 56),
    budgetFit: clampPct(budget === "budget" ? 90 : budget === "premium" ? 72 : 78),
    complexity: clampPct(complexity === "simple" ? 34 : complexity === "complex" ? 88 : 60),
  };
}

function exampleCardsFor(format: ConstructedFormat, answers: Record<string, string>, colors: string[]) {
  const pace = answers.pace;
  const theme = answers.theme;
  if (format === "Standard") {
    if (theme === "tokens") return ["Caretaker's Talent", "Enduring Innocence", "Case of the Gateway Express", "Virtue of Loyalty"];
    if (theme === "artifacts") return ["Simulacrum Synthesizer", "Soulstone Sanctuary", "Patchwork Banner", "Get Lost"];
    if (theme === "enchantments") return ["Caretaker's Talent", "Enduring Innocence", "Ossification", "Case of the Gateway Express"];
    if (pace === "control") return ["Day of Judgment", "Three Steps Ahead", "Stock Up", "Temporary Lockdown"];
    if (pace === "aggro") return ["Llanowar Elves", "Lightning Strike", "Burst Lightning", "Monastery Swiftspear"];
    if (pace === "combo") return ["Stock Up", "Three Steps Ahead", "Soulstone Sanctuary", "Duress"];
    if (theme === "graveyard") return ["Zombify", "Duress", "Soulstone Sanctuary", "Cut Down"];
    return ["Duress", "Lightning Strike", "Stock Up", "Soulstone Sanctuary"];
  }
  if (format === "Pauper") {
    if (theme === "artifacts") return ["Myr Enforcer", "Deadly Dispute", "Galvanic Blast", "Blood Fountain"];
    if (theme === "spells" || pace === "control") return ["Counterspell", "Preordain", "Tolarian Terror", "Snuff Out"];
    if (pace === "aggro") return ["Kuldotha Rebirth", "Goblin Bushwhacker", "Lightning Bolt", "Experimental Synthesizer"];
    if (pace === "combo") return ["Putrid Goblin", "First Day of Class", "Skirk Prospector", "Duress"];
    return ["Deadly Dispute", "Avenging Hunter", "Cast Down", "Weather the Storm"];
  }
  if (format === "Pioneer") {
    if (theme === "spells") return ["Arclight Phoenix", "Consider", "Treasure Cruise", "Fiery Impulse"];
    if (pace === "control") return ["Dovin's Veto", "Memory Deluge", "Temporary Lockdown", "Teferi, Hero of Dominaria"];
    if (pace === "combo") return ["Lotus Field", "Hidden Strings", "Thespian's Stage", "Pore Over the Pages"];
    if (pace === "aggro") return ["Monastery Swiftspear", "Slickshot Show-Off", "Reckless Rage", "Boros Charm"];
    if (theme === "graveyard") return ["Cauldron Familiar", "Witch's Oven", "Mayhem Devil", "Fatal Push"];
    return ["Thoughtseize", "Fatal Push", "Mosswood Dreadknight", "Sheoldred, the Apocalypse"];
  }
  if (theme === "spells") return ["Dragon's Rage Channeler", "Lightning Bolt", "Counterspell", "Murktide Regent"];
  if (theme === "artifacts") return ["Urza's Saga", "Springleaf Drum", "Cranial Plating", "Portable Hole"];
  if (pace === "control") return colors.includes("U") ? ["Counterspell", "Prismatic Ending", "Solitude", "Teferi, Time Raveler"] : ["Fatal Push", "Thoughtseize", "Orcish Bowmasters", "Sheoldred, the Apocalypse"];
  if (pace === "combo") return ["Underworld Breach", "Mishra's Bauble", "Grinding Station", "Spell Pierce"];
  if (pace === "aggro") return ["Monastery Swiftspear", "Lightning Bolt", "Lava Dart", "Mishra's Bauble"];
  if (theme === "graveyard") return ["Persist", "Archon of Cruelty", "Thoughtseize", "Fatal Push"];
  return ["Thoughtseize", "Fatal Push", "Orcish Bowmasters", "Seasoned Pyromancer"];
}

function commanderPackageFor(commanderName: string, archetype: string, profileLabel: string): string[] {
  const byCommander: Record<string, string[]> = {
    "Atraxa, Praetors' Voice": ["Evolution Sage", "Inexorable Tide", "Tezzeret's Gambit", "Ichormoon Gauntlet"],
    "Yuriko, the Tiger's Shadow": ["Brainstorm", "Scroll Rack", "Ingenious Infiltrator", "Temporal Trespass"],
    "Kess, Dissident Mage": ["Past in Flames", "Snapcaster Mage", "Dark Ritual", "Jeska's Will"],
    "Thrasios, Triton Hero": ["Training Grounds", "Seedborn Muse", "Biomancer's Familiar", "Freed from the Real"],
    "Tymna the Weaver": ["Esper Sentinel", "Skullclamp", "Reconnaissance Mission", "Toxic Deluge"],
    "Baral, Chief of Compliance": ["Counterspell", "High Tide", "Mystic Remora", "Sapphire Medallion"],
    "Krenko, Mob Boss": ["Skirk Prospector", "Impact Tremors", "Goblin Chieftain", "Shared Animosity"],
    "Zada, Hedron Grinder": ["Expedite", "Crimson Wisps", "Young Pyromancer", "Storm-Kiln Artist"],
    "Rakdos, Lord of Riots": ["Vilis, Broker of Blood", "Dragon Mage", "Rakdos Signet", "Neheb, the Eternal"],
    "Norin the Wary": ["Impact Tremors", "Confusion in the Ranks", "Genesis Chamber", "Purphoros, God of the Forge"],
    "The Gitrog Monster": ["Dakmor Salvage", "Life from the Loam", "Squandered Resources", "Ramunap Excavator"],
    "Krark, the Thumbless": ["Krark's Thumb", "Tavern Scoundrel", "Jeska's Will", "Storm-Kiln Artist"],
    "Meren of Clan Nel Toth": ["Spore Frog", "Sakura-Tribe Elder", "Victimize", "Plaguecrafter"],
    "Muldrotha, the Gravetide": ["Seal of Primordium", "Eternal Witness", "Satyr Wayfinder", "Pernicious Deed"],
    "Chulane, Teller of Tales": ["Aluren", "Cloudstone Curio", "Whitemane Lion", "Beast Whisperer"],
    "Korvold, Fae-Cursed King": ["Mayhem Devil", "Dockside Extortionist", "Pitiless Plunderer", "Deadly Dispute"],
    "Kenrith, the Returned King": ["Biomancer's Familiar", "Training Grounds", "Faeburrow Elder", "Smothering Tithe"],
    "Tatyova, Benthic Druid": ["Scapeshift", "Retreat to Coralhelm", "Exploration", "Field of the Dead"],
    "Breya, Etherium Shaper": ["Krark-Clan Ironworks", "Sword of the Meek", "Thopter Foundry", "Goblin Engineer"],
    "Ghave, Guru of Spores": ["Cathars' Crusade", "Ashnod's Altar", "Doubling Season", "Blood Artist"],
    "Queen Marchesa": ["Court of Grace", "No Mercy", "Ghostly Prison", "Disrupt Decorum"],
    "Kynaios and Tiro of Meletis": ["Tempt with Discovery", "Veteran Explorer", "Fevered Visions", "Ghostly Prison"],
    Phelddagrif: ["Collective Voyage", "Tempt with Discovery", "Rites of Flourishing", "Swords to Plowshares"],
    "Najeela, the Blade-Blossom": ["Derevi, Empyrial Tactician", "Druid's Repository", "Nature's Will", "Grim Hireling"],
    "Gitrog Monster": ["Dakmor Salvage", "Life from the Loam", "Squandered Resources", "Ramunap Excavator"],
    "Zur the Enchanter": ["Necropotence", "Rest in Peace", "Solemnity", "Diplomatic Immunity"],
    "Edgar Markov": ["Skullclamp", "Shared Animosity", "Stromkirk Captain", "Blood Artist"],
    "The Ur-Dragon": ["Dragon Tempest", "Crucible of Fire", "Sarkhan's Triumph", "Miirym, Sentinel Wyrm"],
  };
  if (byCommander[commanderName]) return byCommander[commanderName];
  if (/control/i.test(archetype) || profileLabel === "Calculated Control") return ["Counterspell", "Swords to Plowshares", "Rhystic Study", "Supreme Verdict"];
  if (/tokens/i.test(archetype)) return ["Skullclamp", "Cathars' Crusade", "Anointed Procession", "Impact Tremors"];
  if (/graveyard|lands/i.test(archetype)) return ["Eternal Witness", "Victimize", "Life from the Loam", "Bojuka Bog"];
  if (/combo|spellslinger/i.test(archetype)) return ["Mystic Remora", "Jeska's Will", "Underworld Breach", "Aetherflux Reservoir"];
  return ["Sol Ring", "Arcane Signet", "Beast Within", "Guardian Project"];
}

function planForConstructed(answers: Record<string, string>) {
  if (answers.pace === "control") {
    return ["Trade one-for-one early", "Pull ahead with card advantage", "Win with a small number of hard-to-answer threats"];
  }
  if (answers.pace === "aggro") {
    return ["Curve out quickly", "Use interaction to clear blockers", "Convert stalled boards into burn or evasion damage"];
  }
  if (answers.pace === "combo") {
    return ["Prioritise hands with setup and protection", "Use cantrips/tutors to find the engine", "Sideboard into a resilient backup plan"];
  }
  if (answers.theme === "graveyard") {
    return ["Stock the graveyard without overcommitting", "Turn recursion into card advantage", "Keep post-board threats that ignore graveyard hate"];
  }
  return ["Develop efficient threats", "Answer the opponent's best card", "Win through repeated two-for-ones and flexible sideboarding"];
}

function sideboardForConstructed(format: ConstructedFormat, answers: Record<string, string>) {
  const base = answers.interaction === "heavy"
    ? ["extra counter/removal package", "graveyard hate", "anti-combo pressure"]
    : ["graveyard hate", "artifact/enchantment answers", "extra threats for grindy games"];
  if (format === "Pauper") return ["red/black removal upgrades", "graveyard hate", "life-gain or fog effects"];
  if (format === "Standard") return ["metagame removal swaps", "extra card advantage", "anti-aggro or anti-control package"];
  return base;
}

function buildConstructedRecommendations(
  format: ConstructedFormat,
  answers: Record<string, string>,
  colors: string[],
  traits: ConstructedTraits
): ConstructedRecommendation[] {
  const primaryTitle = constructedArchetypeName(format, answers, colors);
  const primary: ConstructedRecommendation = {
    id: "primary",
    title: primaryTitle,
    subtitle: constructedProfileDescription(format, answers, primaryTitle),
    colors,
    archetype: primaryTitle,
    matchPct: clampPct(82 + Math.round((traits.metaSafety + traits.synergy) / 18)),
    role: answers.metagame === "rogue_coherent" ? "Rogue pick" : answers.metagame === "meta_safe" ? "Most competitive" : "Best fit",
    plan: planForConstructed(answers),
    exampleCards: exampleCardsFor(format, answers, colors),
    sideboard: sideboardForConstructed(format, answers),
  };

  const interactiveColors = colors.includes("U") ? colors : colors.slice(0, 1).concat("U");
  const interactiveName = `${colorName(interactiveColors)} ${answers.pace === "aggro" ? "Tempo" : "Interactive Midrange"}`;
  const interactive: ConstructedRecommendation = {
    id: "interactive",
    title: interactiveName,
    subtitle: "A safer version with more stack/board interaction so the deck has agency in unknown matchups.",
    colors: interactiveColors.slice(0, 2),
    archetype: interactiveName,
    matchPct: clampPct(primary.matchPct - (answers.interaction === "heavy" ? 4 : 9)),
    role: "Safer matchup spread",
    plan: ["Lower the curve", "Play more flexible answers", "Keep threats that survive common removal"],
    exampleCards: exampleCardsFor(format, { ...answers, pace: "control", theme: answers.theme }, interactiveColors.slice(0, 2)),
    sideboard: sideboardForConstructed(format, { ...answers, interaction: "heavy" }),
  };

  const budgetName = `${colorName(colors)} Collection Core`;
  const budget: ConstructedRecommendation = {
    id: "collection-core",
    title: budgetName,
    subtitle: "A cleaner starting point for mostly-owned builds: fewer premium staples, clearer upgrade lanes, less fragile mana.",
    colors,
    archetype: budgetName,
    matchPct: clampPct(primary.matchPct - (answers.budget === "budget" ? 3 : 12)),
    role: "Budget/owned-friendly",
    plan: ["Start with the highest-synergy commons/uncommons", "Use budget interaction before premium staples", "Mark expensive upgrades as optional"],
    exampleCards: format === "Standard"
      ? ["owned threats", "current legal budget removal", "sideboard role-players", "upgrade slots"]
      : exampleCardsFor(format, { ...answers, budget: "budget" }, colors).slice(0, 3).concat("budget flex slots"),
    sideboard: ["cheap graveyard hate", "narrow answers for local meta", "extra threats for removal-heavy decks"],
  };

  return [primary, interactive, budget].sort((a, b) => b.matchPct - a.matchPct);
}

export default function PlaystyleQuizToolClient() {
  const router = useRouter();
  const [format, setFormat] = useState<QuizFormat>("Commander");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [selectedCommander, setSelectedCommander] = useState("");
  const [selectedConstructedPath, setSelectedConstructedPath] = useState("");
  const [images, setImages] = useState<Record<string, CardImage>>({});
  const [started, setStarted] = useState(false);

  const questions = useMemo(() => {
    if (isConstructed(format)) return getConstructedQuizQuestions(format);
    return QUIZ_QUESTIONS.map((question) => ({
      id: question.id,
      text: question.text,
      options: question.answers.map((answer) => ({ value: answer.id, label: answer.text })),
    }));
  }, [format]);

  const commanderResult = useMemo(() => {
    if (!done || isConstructed(format)) return null;
    const profile = calculateProfile(answers);
    const traits = computeTraits(answers);
    return {
      profile,
      traits,
      commanders: getCommanderSuggestionsWithMatch(profile, traits),
      archetypes: getArchetypeSuggestionsWithMatch(profile, traits),
    };
  }, [answers, done, format]);

  const constructedResult = useMemo(() => {
    if (!done || !isConstructed(format)) return null;
    const colors = colorsForConstructed(format, answers);
    const profileLabel = deriveConstructedProfileLabel(answers);
    const archetype = deriveConstructedArchetypeFromQuizAnswers(format, answers);
    const power = deriveConstructedPowerFromQuizAnswers(answers);
    const budget = deriveConstructedBudgetFromQuizAnswers(answers);
    const direction = deriveConstructedDirectionFromQuizAnswers(answers);
    const traits = deriveConstructedTraits(answers);
    const recommendations = buildConstructedRecommendations(format, answers, colors, traits);
    const primaryTitle = recommendations[0]?.title || archetype;
    const profileDescription = constructedProfileDescription(format, answers, primaryTitle);
    return { colors, profileLabel, profileDescription, archetype, power, budget, direction, traits, recommendations };
  }, [answers, done, format]);

  useEffect(() => {
    const names: string[] = [];
    if (commanderResult?.commanders.length) {
      const commanders = commanderResult.commanders.slice(0, 6);
      names.push(...commanders.map((row) => row.name));
      commanders.forEach((row) => {
        names.push(...commanderPackageFor(row.name, row.archetype, commanderResult.profile.label));
      });
      if (!selectedCommander) setSelectedCommander(commanders[0]?.name || "");
    }
    if (constructedResult?.recommendations.length) {
      names.push(...constructedResult.recommendations.flatMap((recommendation) => recommendation.exampleCards));
    }
    const unique = uniqueNames(names);
    if (!unique.length) return;
    fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: unique }),
    })
      .then((res) => res.json())
      .then((json) => {
        const next: Record<string, CardImage> = {};
        (json?.data || []).forEach((card: { name: string; image_uris?: { small?: string; normal?: string; art_crop?: string } }) => {
          if (card?.name && card?.image_uris) next[card.name] = card.image_uris;
        });
        setImages(next);
      })
      .catch(() => {});
  }, [commanderResult, constructedResult, selectedCommander]);

  useEffect(() => {
    if (!constructedResult?.recommendations.length) return;
    if (constructedResult.recommendations.some((recommendation) => recommendation.id === selectedConstructedPath)) return;
    setSelectedConstructedPath(constructedResult.recommendations[0]?.id || "");
  }, [constructedResult, selectedConstructedPath]);

  function answerCurrent(value: string) {
    setStarted(true);
    const question = questions[index];
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    if (index >= questions.length - 1) {
      setDone(true);
      return;
    }
    setIndex((current) => current + 1);
  }

  function reset(nextFormat = format) {
    setFormat(nextFormat);
    setIndex(0);
    setAnswers({});
    setDone(false);
    setStarted(false);
    setSelectedCommander("");
    setSelectedConstructedPath("");
    setImages({});
  }

  function openBuilder() {
    if (commanderResult) {
      const commander = selectedCommander || commanderResult.commanders[0]?.name || "";
      const commanderPick = commanderResult.commanders.find((row) => row.name === commander) || commanderResult.commanders[0];
      const packageCards = commanderPick ? commanderPackageFor(commanderPick.name, commanderPick.archetype, commanderResult.profile.label) : [];
      saveBuildDeckHandoff({
        format: "Commander",
        commander,
        idea: [
          `Build a ${commanderResult.profile.label} Commander deck around ${commander}.`,
          commanderResult.profile.description,
          commanderPick ? `Lean into the ${commanderPick.archetype} package.` : null,
          packageCards.length ? `Style-fit cards to consider: ${packageCards.join(", ")}.` : null,
        ].filter(Boolean).join(" "),
        budget: answers.budget === "budget" || answers.budget === "own" ? "Budget" : "Moderate",
        power: commanderResult.traits.comboAppetite > 70 || commanderResult.traits.control > 70 ? "Focused" : "Casual",
        sourceLabel: "Playstyle Quiz",
      });
      router.push("/build-a-deck");
      return;
    }
    if (constructedResult && isConstructed(format)) {
      const recommendation =
        constructedResult.recommendations.find((item) => item.id === selectedConstructedPath) ||
        constructedResult.recommendations[0];
      saveBuildDeckHandoff({
        format,
        idea: [
          `${recommendation?.title || constructedResult.archetype}.`,
          recommendation?.subtitle,
          recommendation?.plan.length ? `Game plan: ${recommendation.plan.join("; ")}.` : null,
          recommendation?.exampleCards.length ? `Example package: ${recommendation.exampleCards.join(", ")}.` : null,
          explainConstructed(answers),
        ].filter(Boolean).join(" "),
        colors: recommendation?.colors.length ? recommendation.colors : constructedResult.colors,
        budget: constructedResult.budget as "Budget" | "Moderate" | "High",
        power: constructedResult.power as "Casual" | "Mid" | "Focused" | "Optimized" | "Competitive",
        sourceLabel: "Playstyle Quiz",
      });
      router.push("/build-a-deck");
    }
  }

  const progress = done ? 100 : Math.round(((index + 1) / questions.length) * 100);
  const currentQuestion = questions[index];

  return (
    <main className="min-h-[calc(100vh-82px)] bg-[#050608] text-white">
      <section className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href="/tools" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
            Tools
          </Link>
          <h1 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">Playstyle Quiz</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Pick a format, answer a few deck-building questions, then open the right ManaTap builder with your result prefilled.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div className="mb-5 grid gap-2 md:grid-cols-5">
              {FORMATS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => reset(opt.id)}
                  style={{
                    backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.82), rgba(0,0,0,0.46)), url("${opt.art}")`,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  }}
                  className={`relative min-h-28 overflow-hidden rounded-lg border p-3 text-left transition ${
                    format === opt.id
                      ? "border-cyan-300 text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.16)]"
                      : "border-white/10 text-zinc-300 hover:border-cyan-300/35"
                  }`}
                >
                  <span className={`absolute inset-0 bg-gradient-to-r ${opt.accent} to-transparent opacity-80`} aria-hidden />
                  <span className="relative block text-sm font-black drop-shadow">{opt.label}</span>
                  <span className="relative mt-1 block text-xs text-zinc-200/75 drop-shadow">{opt.sub}</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/30">
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{done ? "Result ready" : `Question ${index + 1} of ${questions.length}`}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {!done ? (
                <div>
                  <h2 className="text-2xl font-black text-white">{currentQuestion.text}</h2>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {currentQuestion.options.map((option, optionIndex) => {
                      const style = ANSWER_STYLES[optionIndex % ANSWER_STYLES.length];
                      const Icon = style.icon;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => answerCurrent(option.value)}
                          className={`flex min-h-20 items-center gap-3 rounded-lg border p-4 text-left text-sm font-semibold transition ${style.className}`}
                        >
                          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border border-white/15 bg-black/35">
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-5 flex justify-between">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => setIndex((current) => Math.max(0, current - 1))}
                      className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => reset()}
                      className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                    >
                      Restart
                    </button>
                  </div>
                </div>
              ) : commanderResult ? (
                <CommanderResult
                  result={commanderResult}
                  images={images}
                  selectedCommander={selectedCommander}
                  onSelectCommander={setSelectedCommander}
                  onOpenBuilder={openBuilder}
                  onRestart={() => reset()}
                />
              ) : constructedResult ? (
                <ConstructedResult
                  result={constructedResult}
                  format={format}
                  answers={answers}
                  images={images}
                  selectedPath={selectedConstructedPath}
                  onSelectPath={setSelectedConstructedPath}
                  onOpenBuilder={openBuilder}
                  onRestart={() => reset()}
                />
              ) : null}
            </div>

            {!started && !done ? <ExampleQuizPreview /> : null}
          </div>

          <aside className="xl:sticky xl:top-24 xl:self-start">
            <PlaystyleSideRail format={format} done={done} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function PlaystyleSideRail({ format, done }: { format: QuizFormat; done: boolean }) {
  const steps = format === "Commander"
    ? ["Profile scores", "Commander art picks", "Style-fit card package", "Builder handoff"]
    : ["Profile scores", "60-card paths", "Suggested cards with art", "Builder handoff"];
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Result shape</p>
        <h2 className="mt-2 text-xl font-black text-white">{done ? "Ready to build" : `${format} quiz`}</h2>
        <div className="mt-4 space-y-2">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-black/30 p-3">
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-cyan-300/15 text-xs font-black text-cyan-200">
                {index + 1}
              </span>
              <span className="text-sm text-neutral-200">{step}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200">Next moves</p>
        <div className="mt-3 grid gap-2">
          {[
            { href: "/build-a-deck", label: "Open Deck Builder", sub: "Use the quiz handoff" },
            { href: "/tools/finish-deck", label: "Complete This Deck", sub: "Patch a half-built list" },
            { href: "/mtg-deck-checker", label: "Deck Checker", sub: "Audit a finished deck" },
            { href: "/tools/custom-card", label: "Custom Card Creator", sub: "Make a profile card" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg border border-neutral-800 bg-black/30 p-3 transition hover:border-cyan-300/45 hover:bg-cyan-300/5">
              <span className="block text-sm font-black text-white">{item.label}</span>
              <span className="mt-1 block text-xs text-neutral-500">{item.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-100">Tip</p>
        <p className="mt-2 text-sm leading-6 text-amber-50/80">
          Switching format changes the result: Commander recommends leaders, while Modern, Pioneer, Standard, and Pauper recommend playable card packages.
        </p>
      </section>
    </div>
  );
}

function ExampleQuizPreview() {
  return (
    <div className="relative mt-5 overflow-hidden rounded-xl border border-amber-300/25 bg-zinc-950/75 p-5 shadow-2xl shadow-black/30">
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-[47%] w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg]">
          <div className="border-y-[3px] border-amber-200/90 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.28em] text-zinc-950">
              Example result preview
            </p>
          </div>
        </div>
      </div>
      <div className="relative space-y-4 opacity-[0.72] saturate-[0.78]">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Result ready</span>
            <span>100%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: "100%" }} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-200">Commander profile</p>
              <h2 className="mt-2 text-2xl font-black text-white">Chaos Gremlin</h2>
              <p className="mt-2 text-sm text-zinc-300">
                Unpredictable turns, table stories, and explosive commander choices.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Aggression", 85],
                ["Combo Appetite", 90],
                ["Variance", 100],
                ["Budget Flex", 80],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{label}</span>
                    <span className="font-mono text-cyan-200">{value}%</span>
                  </div>
                  <MiniProgress value={Number(value)} />
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Krark, the Thumbless", "98% / Chaos"],
                ["Zada, Hedron Grinder", "97% / Spellslinger"],
                ["Norin the Wary", "92% / Chaos"],
              ].map(([name, meta], index) => (
                <div
                  key={name}
                  className="overflow-hidden rounded-lg border border-neutral-800 bg-black/35"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.92)), url("/format-pill-backgrounds/commander-pill-background.png")`,
                    backgroundPosition: `${35 + index * 18}% center`,
                    backgroundSize: "cover",
                  }}
                >
                  <div className="flex h-28 flex-col justify-end p-3">
                    <p className="text-sm font-black text-white">{name}</p>
                    <p className="text-xs text-cyan-200">{meta}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Constructed profile</p>
              <h2 className="mt-2 text-2xl font-black text-white">Calculated Control</h2>
              <p className="mt-2 text-sm text-zinc-300">
                A Modern Azorius Control path with clear card roles, sideboard texture, and builder-ready notes.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Azorius Control", "94% match", "Counterspell / Solitude / Teferi"],
                ["Azorius Tempo", "86% match", "cheap answers / resilient threats"],
                ["Collection Core", "79% match", "budget interaction / upgrade slots"],
              ].map(([title, match, cards]) => (
                <div key={title} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-3">
                  <p className="text-sm font-black text-white">{title}</p>
                  <p className="mt-1 text-xs font-bold text-cyan-200">{match}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-neutral-300">{cards}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Game plan", "Trade early, draw extra cards, finish cleanly."],
                ["Sideboard", "Graveyard hate, anti-combo counters, removal swaps."],
                ["Handoff", "Open builder with this exact path prefilled."],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-neutral-400">{label}</p>
                  <p className="mt-2 text-xs leading-5 text-neutral-300">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniProgress({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
      <div className="h-full rounded-full bg-cyan-300" style={{ width: `${value}%` }} />
    </div>
  );
}

function TraitBar({ traits }: { traits: PlaystyleTraits }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {(Object.keys(traits) as Array<keyof PlaystyleTraits>).map((key) => (
        <div key={key} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-neutral-400">{getTraitLabel(key)}</span>
            <span className="font-mono text-cyan-200">{traits[key]}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${traits[key]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommanderResult({
  result,
  images,
  selectedCommander,
  onSelectCommander,
  onOpenBuilder,
  onRestart,
}: {
  result: {
    profile: PlaystyleProfile;
    traits: PlaystyleTraits;
    commanders: ReturnType<typeof getCommanderSuggestionsWithMatch>;
    archetypes: ReturnType<typeof getArchetypeSuggestionsWithMatch>;
  };
  images: Record<string, CardImage>;
  selectedCommander: string;
  onSelectCommander: (name: string) => void;
  onOpenBuilder: () => void;
  onRestart: () => void;
}) {
  const selected = result.commanders.find((commander) => commander.name === selectedCommander) || result.commanders[0];
  const packageCards = selected ? commanderPackageFor(selected.name, selected.archetype, result.profile.label) : [];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-200">Commander profile</p>
        <h2 className="mt-2 text-3xl font-black text-white">{result.profile.label}</h2>
        <p className="mt-2 text-sm text-zinc-300">{result.profile.description}</p>
      </div>

      <TraitBar traits={result.traits} />

      <div>
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Pick a commander</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {result.commanders.slice(0, 6).map((commander) => {
            const selected = selectedCommander === commander.name;
            const image = images[commander.name];
            return (
              <button
                key={commander.name}
                type="button"
                onClick={() => onSelectCommander(commander.name)}
                className={`overflow-hidden rounded-lg border text-left transition ${
                  selected ? "border-cyan-300 bg-cyan-300/15" : "border-neutral-800 bg-black/35 hover:border-cyan-300/40"
                }`}
              >
                <div className="h-28 bg-neutral-900">
                  {image?.art_crop || image?.normal || image?.small ? (
                    <img src={image.art_crop || image.normal || image.small} alt={commander.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="text-sm font-black text-white">{commander.name}</p>
                  <p className="mt-1 text-xs text-cyan-200">{commander.matchPct || 75}% match / {commander.archetype}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{commander.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && packageCards.length ? (
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Style-fit card package</h3>
              <p className="text-xs text-neutral-500">Cards that naturally support {selected.name}&apos;s {selected.archetype.toLowerCase()} plan.</p>
            </div>
            <p className="text-xs font-bold text-cyan-200">{selected.matchPct || 75}% commander match</p>
          </div>
          <CardArtGrid names={packageCards} images={images} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onOpenBuilder}
          className="flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-500 px-4 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-cyan-400"
        >
          Open Builder With This Commander
        </button>
        <Link href="/collections" className="rounded-lg border border-neutral-700 px-4 py-3 text-center text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Build From Collection
        </Link>
        <button type="button" onClick={onRestart} className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Retake
        </button>
      </div>
    </div>
  );
}

function ConstructedResult({
  result,
  format,
  answers,
  images,
  selectedPath,
  onSelectPath,
  onOpenBuilder,
  onRestart,
}: {
  result: {
    colors: string[];
    profileLabel: string;
    profileDescription: string;
    archetype: string;
    power: string;
    budget: string;
    direction: string;
    traits: ConstructedTraits;
    recommendations: ConstructedRecommendation[];
  };
  format: QuizFormat;
  answers: Record<string, string>;
  images: Record<string, CardImage>;
  selectedPath: string;
  onSelectPath: (path: string) => void;
  onOpenBuilder: () => void;
  onRestart: () => void;
}) {
  const selected = result.recommendations.find((recommendation) => recommendation.id === selectedPath) || result.recommendations[0];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Constructed profile</p>
        <h2 className="mt-2 text-3xl font-black text-white">{result.profileLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{result.profileDescription}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Format" value={format} />
        <Info label="Power" value={result.power} />
        <Info label="Budget" value={result.budget} />
        <Info label="Colors" value={result.colors.join("") || "Open"} />
      </div>

      <ConstructedTraitGrid traits={result.traits} />

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Pick a 60-card path</h3>
            <p className="mt-1 text-xs text-neutral-500">These are builder-ready directions, not just labels.</p>
          </div>
          {selected ? <p className="text-xs font-bold text-cyan-200">{selected.matchPct}% selected match</p> : null}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {result.recommendations.map((recommendation) => {
            const isSelected = selected?.id === recommendation.id;
            return (
              <button
                key={recommendation.id}
                type="button"
                onClick={() => onSelectPath(recommendation.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  isSelected
                    ? "border-cyan-300 bg-cyan-300/15 shadow-[0_0_28px_rgba(34,211,238,0.12)]"
                    : "border-neutral-800 bg-black/35 hover:border-cyan-300/40"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">{recommendation.role}</p>
                    <h4 className="mt-1 text-lg font-black text-white">{recommendation.title}</h4>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-xs font-black text-white">
                    {recommendation.matchPct}%
                  </div>
                </div>
                <ColorPips colors={recommendation.colors} />
                <p className="mt-3 line-clamp-3 text-xs leading-5 text-neutral-300">{recommendation.subtitle}</p>
                <CardThumbStrip names={recommendation.exampleCards.slice(0, 4)} images={images} className="mt-3" />
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <DetailPanel icon={Target} label="Game plan" items={selected.plan} />
          <CardPackagePanel icon={Layers} label="Suggested cards" names={selected.exampleCards} images={images} />
          <DetailPanel icon={Shield} label="Sideboard notes" items={selected.sideboard} />
        </div>
      ) : null}

      <div className="rounded-lg border border-neutral-800 bg-black/30 p-4">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-300">Builder notes</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-300">
          {explainConstructed(answers)} Direction: {result.direction}. The builder handoff includes the selected path, game plan, example package, and sideboard notes.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onOpenBuilder}
          className="flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-500 px-4 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-cyan-400"
        >
          Open 60-Card Builder
        </button>
        <Link href="/collections" className="rounded-lg border border-neutral-700 px-4 py-3 text-center text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Build From Collection
        </Link>
        <button type="button" onClick={onRestart} className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800">
          Retake
        </button>
      </div>
    </div>
  );
}

function ConstructedTraitGrid({ traits }: { traits: ConstructedTraits }) {
  const rows: Array<{ key: ConstructedTraitKey; label: string; icon: typeof Zap }> = [
    { key: "speed", label: "Speed", icon: Zap },
    { key: "interaction", label: "Interaction", icon: Shield },
    { key: "synergy", label: "Synergy", icon: Sparkles },
    { key: "resilience", label: "Resilience", icon: Trophy },
    { key: "metaSafety", label: "Meta Safety", icon: Target },
    { key: "budgetFit", label: "Budget Fit", icon: Coins },
    { key: "complexity", label: "Complexity", icon: Brain },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {rows.map(({ key, label, icon: Icon }) => (
        <div key={key} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-neutral-400">
              <Icon className="h-3.5 w-3.5 text-cyan-200" aria-hidden />
              {label}
            </span>
            <span className="font-mono text-cyan-200">{traits[key]}%</span>
          </div>
          <MiniProgress value={traits[key]} />
        </div>
      ))}
    </div>
  );
}

function ColorPips({ colors }: { colors: string[] }) {
  const classes: Record<string, string> = {
    W: "border-yellow-100 bg-yellow-100 text-zinc-950",
    U: "border-sky-300 bg-sky-400 text-zinc-950",
    B: "border-zinc-300 bg-zinc-950 text-white",
    R: "border-red-300 bg-red-500 text-white",
    G: "border-emerald-300 bg-emerald-500 text-zinc-950",
  };
  const ordered = colors.length ? colors : ["?"];
  return (
    <div className="flex gap-1.5">
      {ordered.map((color) => (
        <span
          key={color}
          className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-black ${classes[color] || "border-neutral-500 bg-neutral-800 text-neutral-200"}`}
        >
          {color}
        </span>
      ))}
    </div>
  );
}

function imageForName(images: Record<string, CardImage>, name: string): CardImage | undefined {
  return images[name] || Object.entries(images).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function CardThumbStrip({ names, images, className = "" }: { names: string[]; images: Record<string, CardImage>; className?: string }) {
  return (
    <div className={`flex min-h-14 gap-1.5 ${className}`}>
      {names.map((name) => {
        const image = imageForName(images, name);
        return (
          <div key={name} className="group relative h-14 w-10 overflow-hidden rounded border border-white/10 bg-neutral-900">
            {image?.art_crop || image?.normal || image?.small ? (
              <img src={image.art_crop || image.normal || image.small} alt={name} className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div className="grid h-full w-full place-items-center px-1 text-center text-[7px] leading-tight text-neutral-500">{name}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardArtGrid({ names, images }: { names: string[]; images: Record<string, CardImage> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {names.map((name) => {
        const image = imageForName(images, name);
        return (
          <div key={name} className="overflow-hidden rounded-lg border border-neutral-800 bg-black/35">
            <div className="h-28 bg-neutral-900">
              {image?.art_crop || image?.normal || image?.small ? (
                <img src={image.art_crop || image.normal || image.small} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center px-3 text-center text-xs text-neutral-500">{name}</div>
              )}
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-black text-white">{name}</p>
              <p className="mt-1 text-xs text-cyan-200/80">Style-fit include</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardPackagePanel({ icon: Icon, label, names, images }: { icon: typeof Target; label: string; names: string[]; images: Record<string, CardImage> }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/30 p-4">
      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-neutral-300">
        <Icon className="h-4 w-4 text-cyan-200" aria-hidden />
        {label}
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {names.map((name) => {
          const image = imageForName(images, name);
          return (
            <div key={name} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
              <div className="h-20 bg-neutral-900">
                {image?.art_crop || image?.normal || image?.small ? (
                  <img src={image.art_crop || image.normal || image.small} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center px-2 text-center text-[10px] text-neutral-500">{name}</div>
                )}
              </div>
              <p className="line-clamp-2 px-2 py-2 text-xs font-bold text-neutral-200">{name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({ icon: Icon, label, items }: { icon: typeof Target; label: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/30 p-4">
      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-neutral-300">
        <Icon className="h-4 w-4 text-cyan-200" aria-hidden />
        {label}
      </h3>
      <ul className="mt-3 space-y-2 text-sm leading-5 text-neutral-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-300" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}
