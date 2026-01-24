// app/api/deck/analyze/route.ts

import {
  type SfCard,
  type InferredDeckContext,
  fetchCard,
  fetchCardsBatch,
  inferDeckContext,
} from "@/lib/deck/inference";
import { getActivePromptVersion, getPromptVersion } from "@/lib/config/prompts";
import { COMMANDER_PROFILES } from "@/lib/deck/archetypes";
import {
  CardSuggestion,
  isWithinColorIdentity,
  matchesRequestedType,
  isLegalForFormat,
  normalizeCardName,
} from "@/lib/deck/mtgValidators";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import roleBaselines from "@/lib/data/role_baselines.json";
import colorIdentityMap from "@/lib/data/color_identity_map.json";
import commanderProfiles from "@/lib/data/commander_profiles.json";
import knownBad from "@/lib/data/known_bad.json";

type RoleBaselineEntry = {
  min?: number;
  recommended?: number;
  max?: number;
  notes?: string;
};

type RoleBaselines = {
  commander?: Record<string, RoleBaselineEntry>;
  modern?: Record<string, RoleBaselineEntry>;
  forbid_mislabels?: string[];
};

type ColorIdentityInfo = {
  colors?: string[];
  strengths?: string[];
  weaknesses?: string[];
};

type ColorIdentityDictionary = Record<string, ColorIdentityInfo>;

type CommanderProfileJson = {
  plan?: string;
  preferTags?: string[];
  avoid?: string[];
  mustBePermanent?: boolean;
  notes?: string;
};

type CommanderProfilesDictionary = Record<string, CommanderProfileJson>;

type CommanderProfileEnriched = {
  mustBePermanent?: boolean;
  preferTags?: string[];
  plan?: string;
  avoid?: string[];
  notes?: string;
  archetypeHint?: string;
};

type KnownBadConfig = {
  global?: string[];
  colorCombos?: Record<string, string[]>;
};

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const roleBaselineData = roleBaselines as RoleBaselines;
const colorIdentityData = colorIdentityMap as ColorIdentityDictionary;
const commanderProfilesData = commanderProfiles as CommanderProfilesDictionary;
const knownBadConfig = knownBad as KnownBadConfig;
const knownBadGlobal = new Set((knownBadConfig.global ?? []).map((name) => normalizeCardName(name)));
const knownBadByCombo = new Map<string, Set<string>>();
for (const [comboKey, cardList] of Object.entries(knownBadConfig.colorCombos ?? {})) {
  const normalizedKey = comboKey
    .toUpperCase()
    .replace(/[^WUBRG]/g, "")
    .split("")
    .sort()
    .join("");
  if (!normalizedKey) continue;
  const existing = knownBadByCombo.get(normalizedKey) ?? new Set<string>();
  for (const cardName of cardList ?? []) {
    if (typeof cardName === "string" && cardName.trim()) {
      existing.add(normalizeCardName(cardName));
    }
  }
  knownBadByCombo.set(normalizedKey, existing);
}

const COLOR_PAIR_LABELS: Record<string, string> = {
  WU: "Azorius",
  UW: "Azorius",
  UB: "Dimir",
  BU: "Dimir",
  BR: "Rakdos",
  RB: "Rakdos",
  RG: "Gruul",
  GR: "Gruul",
  GW: "Selesnya",
  WG: "Selesnya",
  WB: "Orzhov",
  BW: "Orzhov",
  UR: "Izzet",
  RU: "Izzet",
  BG: "Golgari",
  GB: "Golgari",
  RW: "Boros",
  WR: "Boros",
  GU: "Simic",
  UG: "Simic",
};

const FAST_MANA = new Set([
  "Mana Crypt",
  "Jeweled Lotus",
  "Mana Vault",
  "Mox Diamond",
  "Chrome Mox",
]);

const FAST_MANA_REPLACEMENT_NOTE = "This deck looks casual; here are casual ramp alternatives.";
const FAST_MANA_REPLACEMENT_PRIORITY: Record<string, string[]> = {
  "Mana Crypt": ["Arcane Signet", "Fellwar Stone", "Mind Stone", "Guardian Idol", "Commander's Sphere"],
  "Jeweled Lotus": ["Arcane Signet", "Fellwar Stone", "Mind Stone", "Guardian Idol", "Coalition Relic"],
  "Mana Vault": ["Arcane Signet", "Fellwar Stone", "Mind Stone", "Commander's Sphere", "Talisman of Creativity"],
  "Mox Diamond": ["Arcane Signet", "Fellwar Stone", "Mind Stone", "Coldsteel Heart"],
  "Chrome Mox": ["Arcane Signet", "Fellwar Stone", "Mind Stone", "Guardian Idol"],
};
const FAST_MANA_REPLACEMENT_POOL = ["Arcane Signet", "Fellwar Stone", "Mind Stone", "Guardian Idol", "Commander's Sphere", "Coalition Relic", "Coldsteel Heart"];

const COMMANDER_BANNED: Record<string, true> = {
  "Adriana's Valor": true,
  "Advantageous Proclamation": true,
  "Amulet of Quoz": true,
  "Ancestral Recall": true,
  "Ashnod's Coupon": true,
  "Assemble the Rank and Vile": true,
  "Backup Plan": true,
  "Balance": true,
  "Biorhythm": true,
  "Black Lotus": true,
  "Brago's Favor": true,
  "Bronze Tablet": true,
  "Channel": true,
  "Chaos Orb": true,
  "Cleanse": true,
  "Contract from Below": true,
  "Crusade": true,
  "Darkpact": true,
  "Demonic Attorney": true,
  "Dockside Extortionist": true,
  "Double Cross": true,
  "Double Deal": true,
  "Double Dip": true,
  "Double Play": true,
  "Double Stroke": true,
  "Double Take": true,
  "Echoing Boon": true,
  "Emissary's Ploy": true,
  "Emrakul, the Aeons Torn": true,
  "Enter the Dungeon": true,
  "Erayo, Soratami Ascendant": true,
  "Erayo's Essence": true,
  "Falling Star": true,
  "Fastbond": true,
  "Golos, Tireless Pilgrim": true,
  "Griselbrand": true,
  "Hired Heist": true,
  "Hold the Perimeter": true,
  "Hullbreacher": true,
  "Hymn of the Wilds": true,
  "Immediate Action": true,
  "Imprison": true,
  "Incendiary Dissent": true,
  "Invoke Prejudice": true,
  "Iona, Shield of Emeria": true,
  "Iterative Analysis": true,
  "Jeweled Bird": true,
  "Jeweled Lotus": true,
  "Jihad": true,
  "Karakas": true,
  "Leovold, Emissary of Trest": true,
  "Library of Alexandria": true,
  "Limited Resources": true,
  "Lutri, the Spellchaser": true,
  "Magical Hacker": true,
  "Mana Crypt": true,
  "Mox Emerald": true,
  "Mox Jet": true,
  "Mox Lotus": true,
  "Mox Pearl": true,
  "Mox Ruby": true,
  "Mox Sapphire": true,
  "Muzzio's Preparations": true,
  "Nadu, Winged Wisdom": true,
  "Natural Unity": true,
  "Paradox Engine": true,
  "Power Play": true,
  "Pradesh Gypsies": true,
  "Primeval Titan": true,
  "Prophet of Kruphix": true,
  "R&D's Secret Lair": true,
  "Rebirth": true,
  "Recurring Nightmare": true,
  "Richard Garfield, Ph.D.": true,
  "Rofellos, Llanowar Emissary": true,
  "Secret Summoning": true,
  "Secrets of Paradise": true,
  "Sentinel Dispatch": true,
  "Shahrazad": true,
  "Sovereign's Realm": true,
  "Staying Power": true,
  "Stone-Throwing Devils": true,
  "Summoner's Bond": true,
  "Sundering Titan": true,
  "Sylvan Primordial": true,
  "Tempest Efreet": true,
  "Time Machine": true,
  "Time Vault": true,
  "Time Walk": true,
  "Timmerian Fiends": true,
  "Tinker": true,
  "Tolarian Academy": true,
  "Trade Secrets": true,
  "Unexpected Potential": true,
  "Upheaval": true,
  "Weight Advantage": true,
  "Worldknit": true,
  "Yawgmoth's Bargain": true,
};

const MODERN_BANNED: Record<string, true> = {
  "Amped Raptor": true,
  "Ancient Den": true,
  "Arcum's Astrolabe": true,
  "Birthing Pod": true,
  "Blazing Shoal": true,
  "Bridge from Below": true,
  "Chrome Mox": true,
  "Cloudpost": true,
  "Dark Depths": true,
  "Deathrite Shaman": true,
  "Dig Through Time": true,
  "Dread Return": true,
  "Eye of Ugin": true,
  "Field of the Dead": true,
  "Fury": true,
  "Gitaxian Probe": true,
  "Glimpse of Nature": true,
  "Golgari Grave-Troll": true,
  "Great Furnace": true,
  "Grief": true,
  "Hogaak, Arisen Necropolis": true,
  "Hypergenesis": true,
  "Jegantha, the Wellspring": true,
  "Krark-Clan Ironworks": true,
  "Lurrus of the Dream-Den": true,
  "Mental Misstep": true,
  "Mycosynth Lattice": true,
  "Mystic Sanctuary": true,
  "Nadu, Winged Wisdom": true,
  "Oko, Thief of Crowns": true,
  "Once Upon a Time": true,
  "Ponder": true,
  "Punishing Fire": true,
  "Rite of Flame": true,
  "Seat of the Synod": true,
  "Second Sunrise": true,
  "Seething Song": true,
  "Sensei's Divining Top": true,
  "Simian Spirit Guide": true,
  "Skullclamp": true,
  "Summer Bloom": true,
  "The One Ring": true,
  "Tibalt's Trickery": true,
  "Treasure Cruise": true,
  "Tree of Tales": true,
  "Umezawa's Jitte": true,
  "Underworld Breach": true,
  "Up the Beanstalk": true,
  "Uro, Titan of Nature's Wrath": true,
  "Vault of Whispers": true,
  "Violent Outburst": true,
  "Yorion, Sky Nomad": true,
};

const PIONEER_BANNED: Record<string, true> = {
  "Amalia Benavides Aguirre": true,
  "Arid Mesa": true,
  "Balustrade Spy": true,
  "Bloodstained Mire": true,
  "Expressive Iteration": true,
  "Felidar Guardian": true,
  "Field of the Dead": true,
  "Flooded Strand": true,
  "Geological Appraiser": true,
  "Heartfire Hero": true,
  "Inverter of Truth": true,
  "Jegantha, the Wellspring": true,
  "Karn, the Great Creator": true,
  "Kethis, the Hidden Hand": true,
  "Leyline of Abundance": true,
  "Lurrus of the Dream-Den": true,
  "Marsh Flats": true,
  "Misty Rainforest": true,
  "Nexus of Fate": true,
  "Oko, Thief of Crowns": true,
  "Once Upon a Time": true,
  "Polluted Delta": true,
  "Scalding Tarn": true,
  "Sorin, Imperious Bloodlord": true,
  "Teferi, Time Raveler": true,
  "Undercity Informer": true,
  "Underworld Breach": true,
  "Uro, Titan of Nature's Wrath": true,
  "Veil of Summer": true,
  "Verdant Catacombs": true,
  "Walking Ballista": true,
  "Wilderness Reclamation": true,
  "Windswept Heath": true,
  "Winota, Joiner of Forces": true,
  "Wooded Foothills": true,
};

const STANDARD_BANNED: Record<string, true> = {
  "Abuelo's Awakening": true,
  "Cori-Steel Cutter": true,
  "Heartfire Hero": true,
  "Hopeless Nightmare": true,
  "Monstrous Rage": true,
  "Proft's Eidetic Memory": true,
  "Screaming Nemesis": true,
  "This Town Ain't Big Enough": true,
  "Up the Beanstalk": true,
  "Vivi Ornitier": true,
};

const BRAWL_BANNED: Record<string, true> = {
  "Ancient Tomb": true,
  "Chalice of the Void": true,
  "Channel": true,
  "Chrome Mox": true,
  "Cori-Steel Cutter": true,
  "Demonic Tutor": true,
  "Mana Drain": true,
  "Meddling Mage": true,
  "Natural Order": true,
  "Strip Mine": true,
  "Tainted Pact": true,
};

const COMMANDER_ONLY_CARDS = new Set([
  "Sol Ring",
  "Command Tower",
  "Arcane Signet",
  "Commander Sphere",
  "Commander Plate",
  "The Great Henge",
  "Rhystic Study",
  "Smothering Tithe",
  "Mystic Remora",
  "Dockside Extortionist",
  "Fierce Guardianship",
  "Deadly Rollick",
  "Flawless Maneuver",
  "Deflecting Swat",
  "Teferi's Protection",
  "Guardian Project",
  "Beast Whisperer",
  "Kindred Discovery",
  "Path of Ancestry",
  "Exotic Orchard",
  "Reflecting Pool",
]);

const GENERIC_COMMANDER_PROFILES: Record<string, CommanderProfileEnriched> = {
  tokens: {
    plan: "Token swarm strategy: produce repeatable bodies, pump the team, and protect the army.",
    preferTags: ["tokens", "anthem", "card draw", "protection"],
    avoid: ["single big threats without token payoff", "overloaded tutors"],
    notes: "Lean on engines like Parallel Lives, mentor draw like Skullclamp, and shield pieces with protection instants.",
    archetypeHint: "Fallback tokens profile — prioritise go-wide payoff, support draw, and instant-speed protection.",
  },
  aristocrats: {
    plan: "Sacrifice-based value engine with death triggers and recursion loops.",
    preferTags: ["sacrifice", "death triggers", "token fodder", "recursion"],
    avoid: ["expensive creatures without ETB value", "lifegain-only packages"],
    notes: "Maintain cheap sac outlets (Viscera Seer), payoff drains (Blood Artist), and recursion (Sir Conrad, the Grim).",
    archetypeHint: "Fallback aristocrats profile — keep fodder flowing, protect engines, and leverage mass drain effects.",
  },
};

type CommanderFallbackRule = {
  colors: string[];
  archetypePattern: RegExp;
  profileKey: keyof typeof GENERIC_COMMANDER_PROFILES;
};

const COMMANDER_FALLBACK_RULES: CommanderFallbackRule[] = [
  {
    colors: ["G", "W"],
    archetypePattern: /(token|go[-\s]?wide|army)/i,
    profileKey: "tokens",
  },
  {
    colors: ["R", "B"],
    archetypePattern: /(sac|aristocrat|sacrifice|blood)/i,
    profileKey: "aristocrats",
  },
];

type SuggestionSlotPlan = {
  role: string;
  requestedType?: string;
  colors?: string[];
  notes?: string;
  quantity?: number;
};

type SlotCandidate = {
  name: string;
  reason?: string;
};

type ValidatedSuggestion = CardSuggestion & {
  slotRole: string;
};

type FilteredCandidate = {
  slotRole: string;
  name: string;
  reason: string;
  source: "gpt" | "retry";
};

type FilterSummary = {
  count: number;
  reasons: string[];
  summaryText: string | null;
};

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {}
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const { maxTokens = 400 } = opts;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      // Note: temperature parameter removed - not supported by this model
      max_output_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const body = await response.json().catch(() => ({}));
  return String(body?.output_text ?? "").trim();
}

function extractJsonObject(raw: string): any | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function planSuggestionSlots(
  deckText: string,
  userMessage: string | undefined,
  context: InferredDeckContext,
  deckAnalysisSystemPrompt: string | null
): Promise<SuggestionSlotPlan[]> {
  const profile = getCommanderProfileData(context.commander, context);
  const promptVersion = getActivePromptVersion();

  // Use the main deck analysis prompt as the base, then add planning-specific instructions
  const basePrompt = deckAnalysisSystemPrompt || "You are ManaTap AI, an expert Magic: The Gathering assistant.";
  
  const systemPrompt = [
    basePrompt,
    "",
    "=== PLANNING MODE ===",
    "Your job is to identify deck problems and plan suggestion slots that fix them.",
    "",
    "WORKFLOW:",
    "1. Identify the deck's style (tokens, aristocrats, control, combo, etc.)",
    "2. Identify the top 3-6 problems (low ramp, weak draw, lack of removal, too few wincons, curve issues, fragile manabase, lack of synergy, missing redundancy)",
    "3. Plan slots that directly address each problem",
    "",
    "Each slot's 'notes' field MUST state the specific problem it fixes (example: 'low early mana', 'no graveyard hate', 'struggles vs flyers', 'runs out of cards', 'can't close games').",
    "",
    "Prioritize slots by: (1) synergy with deck plan (name enabler + payoff, explain sequence), (2) fixing critical problems, (3) curve fit, (4) budget if mentioned.",
    "",
    "Return STRICT JSON: {\"slots\":[{\"role\":\"...\",\"requestedType\":\"permanent|instant|any\",\"colors\":[\"G\",\"R\"],\"notes\":\"short problem description\",\"quantity\":1}]}",
  ].join("\n");

  const profileNoteLines = buildCommanderProfileNotes(profile);
  const baselineSummary = buildCommanderBaselineSummary(context.format);
  const colorSummary = buildColorIdentitySummary(context.colors);

  const userPrompt = [
    `Format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    context.commander ? `Commander: ${context.commander}` : "Commander: (none)",
    profileNoteLines.length ? profileNoteLines.join("\n") : "",
    baselineSummary || "",
    colorSummary || "",
    context.userIntent ? `User goal: ${context.userIntent}` : "",
    context.archetype ? `Detected archetype: ${context.archetype}` : "",
    context.powerLevel ? `Power level: ${context.powerLevel}` : "",
    userMessage ? `User message:\n${userMessage}` : "",
    "Decklist:",
    deckText,
    "",
    "Plan 3-6 slots that cover ramp, interaction, recursion, win conditions, or meta tech as needed.",
    "For each slot, include a 'notes' field that names the deck problem you're solving.",
    "Be concise and respect commander colors/type requirements.",
    `Prompt version: ${promptVersion}-planner`,
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { maxTokens: 380 });
    const parsed = extractJsonObject(raw);
    const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
    return slots.slice(0, 8).map((slot: any) => ({
      role: String(slot?.role || "optional").trim() || "optional",
      requestedType: slot?.requestedType ? String(slot.requestedType) : undefined,
      colors: Array.isArray(slot?.colors)
        ? slot.colors.map((c: string) => String(c).toUpperCase())
        : undefined,
      notes: slot?.notes ? String(slot.notes) : undefined,
      quantity: Number.isFinite(slot?.quantity) ? Number(slot.quantity) : undefined,
    }));
  } catch {
    return [];
  }
}

async function fetchSlotCandidates(
  slot: SuggestionSlotPlan,
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined,
  mode: "normal" | "strict" = "normal",
  deckAnalysisSystemPrompt: string | null
): Promise<SlotCandidate[]> {
  const profile = getCommanderProfileData(context.commander, context);

  // Use the main deck analysis prompt as the base, then add candidate-fetching instructions
  const basePrompt = deckAnalysisSystemPrompt || "You are ManaTap AI, an expert Magic: The Gathering assistant.";
  
  const systemPrompt = [
    basePrompt,
    "",
    "=== CANDIDATE FETCHING MODE ===",
    mode === "strict"
      ? "You must provide legal, on-color Magic card options for one specific slot."
      : "You suggest Magic cards for one specific slot that fix the identified problem.",
    "",
    "RANKING PRIORITY:",
    "1. Synergy with deck plan (highest - prefer on-theme cards)",
    "2. Curve fit (right mana cost for the slot)",
    "3. Budget awareness (if user mentioned budget)",
    "4. Power level (efficiency and impact)",
    "5. Generic staples (lowest - only when clearly needed)",
    "",
    "Each candidate's 'reason' should explain: (1) how it fixes the slot's problem, (2) why it synergizes with the deck plan.",
    "",
    "For synergy explanations: Name the enabler card and payoff card, then describe the sequence (enabler → trigger → payoff).",
    "Example: 'Viscera Seer enables free sacrifices; Blood Artist pays off with drain on death; together they create a value loop.'",
    "",
    "Always respond with STRICT JSON: {\"candidates\":[{\"name\":\"...\",\"reason\":\"...\"}]}"
  ].join("\n");

  const slotColors = slot.colors?.length ? slot.colors.join(", ") : context.colors.join(", ");
  const profileNoteLines = buildCommanderProfileNotes(profile);
  const baselineSummary = buildCommanderBaselineSummary(context.format);
  const colorSummary = buildColorIdentitySummary(context.colors);

  const userPrompt = [
    `Format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    slotColors ? `Allowed colors for this slot: ${slotColors}` : "",
    slot.requestedType ? `Requested type: ${slot.requestedType}` : "Requested type: flexible",
    context.commander ? `Commander: ${context.commander}` : "",
    profileNoteLines.length ? profileNoteLines.join(" | ") : "",
    baselineSummary || "",
    colorSummary || "",
    slot.notes ? `Slot note: ${slot.notes}` : "",
    userMessage ? `User prompt: ${userMessage}` : "",
    "Deck excerpt:",
    deckText.slice(0, 1800),
    "",
    mode === "strict"
      ? "Return 5 legal, on-color replacements that obey the requested type."
      : "Return the 3 best candidates with short reasons.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { maxTokens: 320 });
    const parsed = extractJsonObject(raw);
    const items = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return items.slice(0, mode === "strict" ? 6 : 5).map((item: any) => ({
      name: String(item?.name || "").trim(),
      reason: item?.reason ? String(item.reason) : undefined,
    }));
  } catch {
    return [];
  }
}

async function retrySlotCandidates(
  slot: SuggestionSlotPlan,
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined,
  mode: "normal" | "strict" = "normal",
  deckAnalysisSystemPrompt: string | null
): Promise<SlotCandidate[]> {
  // Use the main deck analysis prompt as the base, then add retry-specific instructions
  const basePrompt = deckAnalysisSystemPrompt || "You are ManaTap AI, an expert Magic: The Gathering assistant.";
  
  const systemPrompt = [
    basePrompt,
    "",
    "=== RETRY MODE ===",
    mode === "strict"
      ? "Previous suggestions failed validation. Provide 5 legal, on-color replacements that obey the requested type."
      : "Previous suggestions failed validation (off-color, wrong type, illegal). Provide stricter replacements.",
    "",
    "CRITICAL: All suggestions must:",
    "- Match deck colors exactly",
    "- Be legal in the format",
    "- Match the requested type (if specified)",
    "- Fix the slot's identified problem",
    "- Synergize with the deck's plan",
    "",
    "Return STRICT JSON: {\"candidates\":[{\"name\":\"...\",\"reason\":\"...\"}]}"
  ].join("\n");

  const slotColors = slot.colors?.length ? slot.colors.join(", ") : context.colors.join(", ");
  const profile = getCommanderProfileData(context.commander, context);
  const profileNoteLines = buildCommanderProfileNotes(profile);
  const baselineSummary = buildCommanderBaselineSummary(context.format);
  const colorSummary = buildColorIdentitySummary(context.colors);

  const userPrompt = [
    `Format: ${context.format}`,
    slotColors ? `Colors EXACT: ${slotColors}` : "",
    slot.requestedType ? `Required type: ${slot.requestedType}` : "",
    context.commander ? `Commander: ${context.commander}` : "",
    profileNoteLines.length ? profileNoteLines.join(" | ") : "",
    baselineSummary || "",
    colorSummary || "",
    "Deck excerpt:",
    deckText.slice(0, 1500),
    userMessage ? `User prompt: ${userMessage}` : "",
    "",
    mode === "strict"
      ? "Return 5 legal, on-color replacements that obey the requested type."
      : "Return 3 replacements that obey color identity AND requested type strictly.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { maxTokens: 260 });
    const parsed = extractJsonObject(raw);
    const items = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return items.slice(0, mode === "strict" ? 6 : 5).map((item: any) => ({
      name: String(item?.name || "").trim(),
      reason: item?.reason ? String(item.reason) : undefined,
    }));
  } catch {
    return [];
  }
}

async function validateSlots(
  slots: SuggestionSlotPlan[],
  context: InferredDeckContext,
  deckEntries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>,
  deckText: string,
  userMessage: string | undefined,
  locked: Set<string>,
  strict: boolean,
  deckAnalysisSystemPrompt: string | null
): Promise<{
  suggestions: CardSuggestion[];
  filtered: FilteredCandidate[];
  required: number;
  filled: number;
}> {
  const suggestions: CardSuggestion[] = [];
  const filtered: FilteredCandidate[] = [];
  const deckNormalized = new Set(deckEntries.map((entry) => normalizeCardName(entry.name)));
  const profile = getCommanderProfileData(context.commander, context);
  const isCommander = context.format === "Commander";

  for (const slot of slots) {
    const quantity = Math.max(1, slot.quantity ?? 1);
    const baseCandidates = await fetchSlotCandidates(slot, context, deckText, userMessage, strict ? "strict" : "normal", deckAnalysisSystemPrompt);
    let picked = 0;

    const attempt = async (candidates: SlotCandidate[], source: "gpt" | "retry") => {
      for (const candidate of candidates) {
        if (picked >= quantity) break;
        const normalizedName = normalizeCardName(candidate.name);
        if (!candidate.name || !normalizedName) {
          filtered.push({ slotRole: slot.role, name: candidate.name || "", reason: "missing name", source });
          continue;
        }
        if (deckNormalized.has(normalizedName)) {
          filtered.push({ slotRole: slot.role, name: candidate.name, reason: "already in deck", source });
          continue;
        }

        if (locked.has(normalizedName)) {
          filtered.push({ slotRole: slot.role, name: candidate.name, reason: "user locked", source });
          continue;
        }

        if (isKnownBadCard(candidate.name, context.colors)) {
          filtered.push({ slotRole: slot.role, name: candidate.name, reason: "community flagged", source });
          continue;
        }

        let card = byName.get(candidate.name.toLowerCase());
        if (!card) {
          const fetched = await fetchCard(candidate.name);
          if (fetched) {
            card = fetched;
            byName.set(fetched.name.toLowerCase(), fetched);
          }
        }
        if (!card) {
          filtered.push({ slotRole: slot.role, name: candidate.name, reason: "card lookup failed", source });
          continue;
        }

        if (!isCommander && COMMANDER_ONLY_CARDS.has(card.name)) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: "commander-only outside EDH", source });
          continue;
        }

        const allowedColors = (slot.colors?.length ? slot.colors : context.colors).map((c) => c.toUpperCase());
        const colorCheck = allowedColors.length ? allowedColors : ["C"];
        if (!isWithinColorIdentity(card, colorCheck)) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: "off-color", source });
          continue;
        }
        if (!isLegalForFormat(card, context.format)) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: `illegal in ${context.format}`, source });
          continue;
        }
        if (profile?.mustBePermanent && !matchesRequestedType(card, "permanent")) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: "commander requires permanents", source });
          continue;
        }
        if (slot.requestedType && slot.requestedType.toLowerCase() !== "any") {
          if (!matchesRequestedType(card, slot.requestedType)) {
            filtered.push({ slotRole: slot.role, name: card.name, reason: `expected ${slot.requestedType}`, source });
            continue;
          }
        }

        suggestions.push({
          card: card.name,
          reason: candidate.reason,
          source,
          requestedType: slot.requestedType,
          slotRole: slot.role,
        });
        deckNormalized.add(normalizedName);
        picked += 1;
      }
    };

    await attempt(baseCandidates, "gpt");
    if (picked < quantity) {
      const retry = await retrySlotCandidates(slot, context, deckText, userMessage, strict ? "strict" : "normal", deckAnalysisSystemPrompt);
      await attempt(retry, "retry");
    }
  }

  const required = slots.reduce((sum, slot) => sum + Math.max(1, slot.quantity ?? 1), 0);
  return { suggestions, filtered, required, filled: suggestions.length };
}

async function postFilterSuggestions(
  candidates: CardSuggestion[],
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  normalizedDeck: Set<string>,
  _currency: string,
  _deckEntries: Array<{ count: number; name: string }>,
  _userId: string | null,
  profile: CommanderProfileEnriched | null,
  locked: Set<string>
): Promise<{ final: CardSuggestion[]; debug: Set<string>; removedCount: number }> {
  const removalReasons = new Set<string>();
  let removedCount = 0;
  const allowedColors = new Set((context.colors.length ? context.colors : ["C"]).map((c) => c.toUpperCase()));
  const merged = new Map<string, CardSuggestion>();
  const forbidRules = Array.isArray(roleBaselineData?.forbid_mislabels)
    ? roleBaselineData.forbid_mislabels
    : [];
  const creatureRampRule = forbidRules.find((rule) => /cultivate/i.test(rule));
  const fabledPassageRule = forbidRules.find((rule) => /fabled passage/i.test(rule));
  const fastManaRule = forbidRules.find((rule) => /mana crypt/i.test(rule) || /fast mana/i.test(rule));

  for (const suggestion of candidates) {
    let card = byName.get(suggestion.card.toLowerCase());
    if (!card) {
      const fetched = await fetchCard(suggestion.card);
      if (fetched) {
        card = fetched;
        byName.set(fetched.name.toLowerCase(), fetched);
      }
    }
    if (!card) {
      removalReasons.add("card lookup failed");
      removedCount += 1;
      continue;
    }

    let needsReview = Boolean(suggestion.needs_review);
    let reasonText = suggestion.reason || "";
    const reviewNotes: string[] = [];

    // Check if card is banned in the current format
    const getBannedList = (format: string): Record<string, true> | null => {
      switch (format) {
        case "Commander":
          return COMMANDER_BANNED;
        case "Modern":
          return MODERN_BANNED;
        case "Pioneer":
          return PIONEER_BANNED;
        case "Standard":
          return STANDARD_BANNED;
        case "Brawl":
          return BRAWL_BANNED;
        default:
          return null;
      }
    };

    const bannedList = getBannedList(context.format);
    if (bannedList && bannedList[card.name]) {
      const message = suggestion.reason
        ? `${suggestion.reason} (banned in ${context.format}, suggest a legal alternative)`
        : `Banned in ${context.format}, suggest a legal alternative.`;
      const existing = merged.get(card.name);
      if (existing) {
        existing.reason = [existing.reason, message].filter(Boolean).join(" | ") || message;
        existing.needs_review = true;
      } else {
        merged.set(card.name, {
          card: card.name,
          reason: message,
          source: suggestion.source,
          requestedType: suggestion.requestedType,
          needs_review: true,
          slotRole: suggestion.slotRole,
          category: suggestion.category,
        });
      }
      removalReasons.add("banned");
      continue;
    }

    if (FAST_MANA.has(card.name) && shouldFlagFastMana(context.powerLevel)) {
      const replacement = await findFastManaReplacement(
        card,
        context,
        byName,
        normalizedDeck,
        allowedColors,
        suggestion.requestedType
      );
      removalReasons.add("fast mana gated");
      removedCount += 1;
      if (!replacement) {
        reviewNotes.push(FAST_MANA_REPLACEMENT_NOTE);
        needsReview = true;
        continue;
      }
      const swapReason = suggestion.reason
        ? `${suggestion.reason} | Replacing ${card.name} with ${replacement.name} for casual tables.`
        : `Replacing ${card.name} with ${replacement.name} to stay casual.`;
      reasonText = swapReason;
      reviewNotes.push(FAST_MANA_REPLACEMENT_NOTE);
      card = replacement;
    }

    if (COMMANDER_ONLY_CARDS.has(card.name) && context.format !== "Commander") {
      removalReasons.add("commander-only outside format");
      removedCount += 1;
      continue;
    }

    if (!isWithinColorIdentity(card, Array.from(allowedColors))) {
      removalReasons.add("off-color identity");
      removedCount += 1;
      continue;
    }

    if (!isLegalForFormat(card, context.format)) {
      removalReasons.add("illegal in format");
      removedCount += 1;
      continue;
    }

    if (locked.has(normalizeCardName(card.name))) {
      removalReasons.add("locked by user");
      removedCount += 1;
      continue;
    }

    if (isKnownBadCard(card.name, context.colors)) {
      removalReasons.add("community flagged");
      removedCount += 1;
      continue;
    }

    if (profile?.mustBePermanent && !matchesRequestedType(card, "permanent")) {
      removalReasons.add("commander requires permanents");
      removedCount += 1;
      continue;
    }

    const norm = normalizeCardName(card.name);
    if (normalizedDeck.has(norm)) {
      removalReasons.add("duplicate");
      removedCount += 1;
      continue;
    }

    const lowerReason = reasonText.toLowerCase();

    if (/cultivate|kodama's reach/i.test(card.name) && lowerReason.includes("creature ramp")) {
      reviewNotes.push(creatureRampRule || "Cultivate-style sorceries are spell-based ramp, not creature ramp.");
    }

    if (/fabled passage/i.test(card.name) && /ramp/.test(lowerReason)) {
      reviewNotes.push(fabledPassageRule || "Fabled Passage fixes colors but does not generate extra mana.");
    }

    if (FAST_MANA.has(card.name) && shouldFlagFastMana(context.powerLevel)) {
      reviewNotes.push(fastManaRule || "Fast mana is typically reserved for high-power or cEDH tables.");
    }

    if (reviewNotes.length) {
      needsReview = true;
      const noteText = reviewNotes.join(" ");
      reasonText = reasonText ? `${reasonText} (${noteText})` : noteText;
    }

    if (merged.has(card.name)) {
      const existing = merged.get(card.name)!;
      const combinedReason = [existing.reason, reasonText]
        .filter(Boolean)
        .map((r) => r!.trim())
        .filter(Boolean)
        .join(" | ");
      existing.reason = combinedReason || existing.reason;
      existing.needs_review = existing.needs_review || needsReview;
      if (reviewNotes.length) {
        const mergedNotes = new Set<string>(existing.reviewNotes || []);
        reviewNotes.forEach((note) => mergedNotes.add(note));
        existing.reviewNotes = Array.from(mergedNotes);
      }
      merged.set(card.name, existing);
      removalReasons.add("duplicate suggestion");
      removedCount += 1;
      continue;
    }

    merged.set(card.name, {
      card: card.name,
      reason: reasonText || undefined,
      source: suggestion.source,
      requestedType: suggestion.requestedType,
      needs_review: needsReview || undefined,
      reviewNotes: reviewNotes.length ? reviewNotes : undefined,
      slotRole: suggestion.slotRole,
      category: suggestion.category,
    });
  }

  const final = Array.from(merged.values());
  return { final, debug: removalReasons, removedCount };
}

async function findFastManaReplacement(
  originalCard: SfCard,
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  normalizedDeck: Set<string>,
  allowedColors: Set<string>,
  requestedType?: string
): Promise<SfCard | undefined> {
  const priorityList = FAST_MANA_REPLACEMENT_PRIORITY[originalCard.name] ?? [];
  const candidates = [...priorityList, ...FAST_MANA_REPLACEMENT_POOL];
  const allowedList = Array.from(allowedColors);
  for (const candidateName of candidates) {
    const norm = normalizeCardName(candidateName);
    if (normalizedDeck.has(norm)) continue;
    let candidate: SfCard | null | undefined = byName.get(candidateName.toLowerCase());
    if (!candidate) {
      candidate = await fetchCard(candidateName);
      if (candidate) {
        byName.set(candidate.name.toLowerCase(), candidate);
      }
    }
    if (!candidate) continue;
    if (!isWithinColorIdentity(candidate, allowedList)) continue;
    if (requestedType && requestedType.toLowerCase() !== "any" && !matchesRequestedType(candidate, requestedType)) continue;
    if (!isLegalForFormat(candidate, context.format)) continue;
    return candidate;
  }
  return undefined;
}

function computeBands(
  format: "Commander" | "Modern" | "Pioneer",
  totalCards: number,
  lands: number,
  ramp: number,
  draw: number,
  removal: number
) {
  const landTarget = format === "Commander" ? 35 : 24;
  const manaBand = lands >= landTarget ? 0.8 : lands >= landTarget - 2 ? 0.7 : 0.55;
  return {
    curve: Math.min(1, Math.max(0.5, 0.8 - Math.max(0, totalCards - (format === "Commander" ? 100 : 60)) * 0.001)),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.25),
    mana: Math.min(1, manaBand),
  };
}

function deckTally(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>
): { lands: number; ramp: number; draw: number; removal: number; curve: number[] } {
  let lands = 0;
  let ramp = 0;
  let draw = 0;
  let removal = 0;
  const curve = [0, 0, 0, 0, 0];

  const landRe = /land/i;
  const drawRe = /draw a card|scry [1-9]|investigate/i;
  const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
  const killRe = /destroy target|exile target|counter target|fight target|deal .* damage to any target/i;

  for (const { name, count } of entries) {
    const card = byName.get(name.toLowerCase());
    const typeLine = card?.type_line || "";
    const oracle = card?.oracle_text || "";

    if (landRe.test(typeLine)) lands += count;
    if (drawRe.test(oracle)) draw += count;
    if (rampRe.test(oracle) || /signet|talisman|sol ring/i.test(name)) ramp += count;
    if (killRe.test(oracle)) removal += count;

    const cmc = typeof card?.cmc === "number" ? card!.cmc : undefined;
    if (typeof cmc === "number") {
      if (cmc <= 1) curve[0] += count;
      else if (cmc <= 2) curve[1] += count;
      else if (cmc <= 3) curve[2] += count;
      else if (cmc <= 4) curve[3] += count;
      else curve[4] += count;
    }
  }

  return { lands, ramp, draw, removal, curve };
}

function matchCommanderFallback(context: InferredDeckContext | null | undefined): CommanderProfileEnriched | null {
  if (!context) return null;
  const colors = Array.isArray(context.colors) ? context.colors.map((c) => c.toUpperCase()) : [];
  if (!colors.length) return null;
  const colorSet = new Set(colors);
  const archetype = String(context.archetype || "");
  for (const rule of COMMANDER_FALLBACK_RULES) {
    const matchesColors = rule.colors.every((c) => colorSet.has(c));
    if (!matchesColors) continue;
    if (!rule.archetypePattern.test(archetype)) continue;
    const template = GENERIC_COMMANDER_PROFILES[rule.profileKey];
    if (!template) continue;
    return { ...template };
  }
  return null;
}

function isKnownBadCard(cardName: string, colors: string[]): boolean {
  const normalized = normalizeCardName(cardName);
  if (knownBadGlobal.has(normalized)) {
    return true;
  }
  const key = (colors || [])
    .map((c) => String(c || "").toUpperCase())
    .filter(Boolean)
    .sort()
    .join("");
  if (!key) return false;
  const bucket = knownBadByCombo.get(key);
  return bucket ? bucket.has(normalized) : false;
}

function getCommanderProfileData(name: string | null | undefined, context?: InferredDeckContext): CommanderProfileEnriched | null {
  if (!name) {
    return matchCommanderFallback(context);
  }
  const jsonProfile = commanderProfilesData[name] ?? null;
  const legacyProfile = COMMANDER_PROFILES[name] ?? null;
  if (!jsonProfile && !legacyProfile) {
    return matchCommanderFallback(context);
  }
  const preferTags = new Set<string>();
  legacyProfile?.preferTags?.forEach((tag) => preferTags.add(tag));
  jsonProfile?.preferTags?.forEach((tag) => preferTags.add(tag));

  return {
    mustBePermanent: legacyProfile?.mustBePermanent ?? jsonProfile?.mustBePermanent,
    preferTags: preferTags.size ? Array.from(preferTags) : undefined,
    plan: jsonProfile?.plan ?? legacyProfile?.archetypeHint,
    avoid: jsonProfile?.avoid,
    notes: jsonProfile?.notes,
    archetypeHint: legacyProfile?.archetypeHint ?? jsonProfile?.notes,
  };
}

function formatBaselineLine(key: string, entry: RoleBaselineEntry | undefined): string | null {
  if (!entry) return null;
  const label = key.replace(/_/g, " ");
  const segments: string[] = [];
  if (entry.min != null && entry.max != null) {
    segments.push(`${entry.min}-${entry.max}`);
  } else {
    if (entry.min != null) segments.push(`min ${entry.min}`);
    if (entry.max != null) segments.push(`max ${entry.max}`);
  }
  if (entry.recommended != null) segments.push(`rec ${entry.recommended}`);
  let text = `${label} ${segments.join(", ")}`.trim();
  const note = entry.notes?.split(/(?<=\.)\s+/)?.[0];
  if (note) {
    text += ` (${note.replace(/\s+/g, " ")})`;
  }
  return text;
}

function buildCommanderBaselineSummary(format: string): string | null {
  if (format !== "Commander") return null;
  const commanderBaselines = roleBaselineData?.commander;
  if (!commanderBaselines) return null;
  const orderedKeys = ["lands", "ramp", "card_draw", "removal", "board_wipes"];
  const pieces = orderedKeys
    .map((key) => formatBaselineLine(key, commanderBaselines[key]))
    .filter((chunk): chunk is string => Boolean(chunk));
  if (!pieces.length) return null;
  return `Commander baselines: ${pieces.join("; ")}. Use these ranges when evaluating the deck.`;
}

function buildColorIdentitySummary(colors: string[]): string | null {
  if (!colors?.length) return null;
  const unique = Array.from(new Set(colors.map((c) => c.toUpperCase()).filter(Boolean)));
  if (!unique.length) return null;
  const sortedKey = unique.slice().sort().join("");
  const guildLabel = COLOR_PAIR_LABELS[sortedKey];

  if (guildLabel && colorIdentityData[guildLabel]) {
    const info = colorIdentityData[guildLabel];
    const strengths = info.strengths?.join(", ") || "n/a";
    const weaknesses = info.weaknesses?.join(", ") || "n/a";
    return `Color identity: ${guildLabel} (${unique.join("/")}). Strengths: ${strengths}. Weaknesses: ${weaknesses}. Aim suggestions at shoring up the weaknesses.`;
  }

  const strengthSet = new Set<string>();
  const weaknessSet = new Set<string>();
  unique.forEach((symbol) => {
    const info = colorIdentityData[symbol];
    info?.strengths?.forEach((value) => strengthSet.add(value));
    info?.weaknesses?.forEach((value) => weaknessSet.add(value));
  });

  if (!strengthSet.size && !weaknessSet.size) return null;
  const strengths = strengthSet.size ? Array.from(strengthSet).join(", ") : "n/a";
  const weaknesses = weaknessSet.size ? Array.from(weaknessSet).join(", ") : "n/a";
  return `Color identity: ${unique.join("/")}. Strengths: ${strengths}. Weaknesses: ${weaknesses}. Use card choices to cover the gaps.`;
}

function buildCommanderProfileNotes(profile: CommanderProfileEnriched | null): string[] {
  if (!profile) return [];
  const notes: string[] = [];
  if (profile.plan) notes.push(`Commander plan: ${profile.plan}`);
  if (profile.preferTags?.length) notes.push(`Prefer tags: ${profile.preferTags.join(", ")}`);
  if (profile.avoid?.length) notes.push(`Avoid: ${profile.avoid.join(", ")}`);
  if (profile.notes && profile.notes !== profile.plan) notes.push(`Notes: ${profile.notes}`);
  if (profile.mustBePermanent) notes.push("Commander prefers permanent-based support.");
  return notes;
}

function shouldFlagFastMana(powerLevel: string | undefined | null): boolean {
  if (!powerLevel) return true;
  return !/^(?:high(?: power)?|c(?:ed)?h)$/i.test(powerLevel.trim());
}

function simplifyFilterReason(raw: string): string {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return "other";
  const lower = cleaned.toLowerCase();
  if (lower.includes("expected")) return "wrong type";
  if (lower.includes("type")) return "wrong type";
  if (lower.includes("off-color")) return "off-color";
  if (lower.includes("color identity")) return "off-color";
  if (lower.includes("illegal")) return cleaned;
  if (lower.includes("banned")) return "banned";
  if (lower.includes("lookup")) return "card not found";
  if (lower.includes("commander requires permanents")) return "commander requires permanents";
  if (lower.includes("commander-only")) return "format-locked";
  if (lower.includes("locked")) return "user-locked card";
  if (lower.includes("community")) return "community flagged";
  if (lower.includes("duplicate suggestion")) return "duplicate suggestions";
  if (lower.includes("duplicate")) return "duplicate";
  if (lower.includes("fast mana")) return "fast mana gated";
  return cleaned;
}

function buildFilterSummary(
  filtered: FilteredCandidate[],
  postRemovalCount: number,
  debugReasons: Set<string>
): FilterSummary {
  const reasons = new Set<string>();
  for (const entry of filtered) {
    reasons.add(simplifyFilterReason(entry.reason));
  }
  for (const reason of debugReasons) {
    reasons.add(simplifyFilterReason(reason));
  }
  const count = filtered.length + postRemovalCount;
  const reasonList = Array.from(reasons).filter(Boolean);
  const summaryText = count > 0
    ? `${count} suggestion${count === 1 ? "" : "s"} were filtered${reasonList.length ? `: ${reasonList.join(", ")}.` : "."}`
    : null;
  return { count, reasons: reasonList, summaryText };
}

const DIVERSITY_ORDER = ["ramp", "draw", "interaction", "theme", "protection", "tutor", "other"];

function deriveSuggestionBucket(s: CardSuggestion): string {
  const source = (s.slotRole || "") + " " + (s.reason || "");
  const lowered = source.toLowerCase();
  if (/ramp|accelerat|mana rock|fast mana|curve/.test(lowered)) return "ramp";
  if (/draw|card advantage|cantrip|wheel/.test(lowered)) return "draw";
  if (/removal|interaction|answer|kill|counter/.test(lowered)) return "interaction";
  if (/token|synergy|theme|tribal|flavor|archetype/.test(lowered)) return "theme";
  if (/protect|shield|hexproof|indestructible|heroic intervention/.test(lowered)) return "protection";
  if (/tutor|search|fetch/.test(lowered)) return "tutor";
  return "other";
}

function rebalanceSuggestionsByCategory(list: CardSuggestion[]): CardSuggestion[] {
  if (list.length <= 1) return list;
  const buckets = new Map<string, CardSuggestion[]>();
  for (const suggestion of list) {
    const bucket = deriveSuggestionBucket(suggestion);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(suggestion);
  }
  const order = DIVERSITY_ORDER.filter((key) => (buckets.get(key) || []).length > 0);
  if (order.length <= 1) return list;
  const working = new Map<string, CardSuggestion[]>(order.map((key) => [key, buckets.get(key)!.slice()]));
  const total = list.length;
  const result: CardSuggestion[] = [];
  while (result.length < total) {
    let added = false;
    for (const key of order) {
      const bucket = working.get(key);
      if (bucket && bucket.length) {
        result.push(bucket.shift()!);
        added = true;
      }
    }
    if (!added) break;
  }
  return result;
}

export async function POST(req: Request) {
  // Durable rate limiting (expensive AI operation - limit abuse)
  try {
    const { getServerSupabase } = await import('@/lib/server-supabase');
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
    const { hashString, hashGuestToken } = await import('@/lib/guest-tracking');
    const { cookies } = await import('next/headers');
    
    let keyHash: string;
    let dailyLimit: number;
    let isPro = false;
    
    if (user) {
      // Authenticated user
      // Use standardized Pro check
      const { checkProStatus } = await import('@/lib/server-pro-check');
      isPro = await checkProStatus(user.id);
      keyHash = `user:${await hashString(user.id)}`;
      dailyLimit = isPro ? 200 : 20; // Analyze is expensive - lower limits
    } else {
      // Unauthenticated - use guest token or IP
      const cookieStore = await cookies();
      const guestToken = cookieStore.get('guest_session_token')?.value;
      
      if (guestToken) {
        const tokenHash = await hashGuestToken(guestToken);
        keyHash = `guest:${tokenHash}`;
      } else {
        // Fallback to IP hash (less reliable but better than nothing)
        const forwarded = (req as any).headers?.get?.('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0].trim() : (req as any).headers?.get?.('x-real-ip') || 'unknown';
        keyHash = `ip:${await hashString(ip)}`;
      }
      dailyLimit = 5; // Very strict for unauthenticated (expensive operation)
    }
    
    const durableLimit = await checkDurableRateLimit(supabase, keyHash, '/api/deck/analyze', dailyLimit, 1);
    
    if (!durableLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Rate limit exceeded. ${user ? (isPro ? 'You\'ve reached the limit of 200 analyses per day. Contact support if you need higher limits.' : 'Free users are limited to 20 analyses per day. Upgrade to Pro for 200/day!') : 'Unauthenticated users are limited to 5 analyses per day. Sign up for free to get 20/day!'}`,
          rate_limited: true
        }),
        { status: 429, headers: { "content-type": "application/json" } }
      );
    }
  } catch (error) {
    // Fail open - don't block requests if rate limit check fails
    console.error('[deck/analyze] Rate limit check failed:', error);
  }

  const body = (await req.json().catch(() => ({}))) as {
    deckText?: string;
    format?: "Commander" | "Modern" | "Pioneer";
    plan?: "Budget" | "Optimized";
    colors?: string[];
    currency?: string;
    commander?: string;
    userMessage?: string;
    useScryfall?: boolean;
    useGPT?: boolean;
    lockCards?: string[];
  };

  // Load prompt version for deck analysis
  // NOTE: This prompt version is tracked for logging/analytics, but deck analysis uses
  // internal helper prompts (planSuggestionSlots, fetchSlotCandidates, etc.) rather than
  // a single main system prompt like chat does. The helper prompts are specialized for
  // the multi-stage deck analysis pipeline (planning -> candidate fetching -> validation).
  // If you want to apply prompt patches to deck analysis, you would need to modify
  // the system prompts in those helper functions (planSuggestionSlots, fetchSlotCandidates, etc.)
  // to incorporate the deck_analysis prompt version's system_prompt.
  let promptVersionId: string | null = null;
  try {
    const promptVersion = await getPromptVersion("deck_analysis");
    if (promptVersion) {
      promptVersionId = promptVersion.id;
      if (process.env.NODE_ENV === "development") {
        console.log(`[deck/analyze] ✅ Loaded prompt version ${promptVersion.version} (${promptVersion.id}) for tracking`);
        console.log(`[deck/analyze] ⚠️ NOTE: Deck analysis uses internal helper prompts, not the main system_prompt from this version`);
      }
    }
  } catch (e) {
    console.warn("[deck/analyze] Failed to load prompt version:", e);
  }

  let deckText = String(body.deckText || "").trim();
  const format: "Commander" | "Modern" | "Pioneer" = body.format ?? "Commander";
  const useScryfall = Boolean(body.useScryfall ?? true);
  const useGPT = Boolean(body.useGPT ?? true);

  const parsed = parseDeckText(deckText);
  if (parsed.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Decklist is empty" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Smart name checking: fix card names using fuzzy matching (like all other functions)
  let nameFixInfo: { fixed: number; items: Array<{ originalName: string; suggestions: string[] }> } | null = null;
  try {
    // Make internal API call to parse-and-fix-names
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    (typeof req.url === 'string' ? new URL(req.url).origin : 'http://localhost:3000');
    const fixRes = await fetch(`${baseUrl}/api/deck/parse-and-fix-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckText }),
    });
    const fixData: any = await fixRes.json().catch(() => ({}));
    
    if (fixData?.ok && Array.isArray(fixData.cards)) {
      // Use corrected card names
      const correctedCards = fixData.cards;
      // Rebuild deckText with corrected names
      deckText = correctedCards.map((c: any) => `${c.qty} ${c.name}`).join('\n');
      
      // Track what was fixed for potential user feedback
      if (Array.isArray(fixData.items) && fixData.items.length > 0) {
        nameFixInfo = {
          fixed: fixData.items.length,
          items: fixData.items.map((item: any) => ({
            originalName: item.originalName || '',
            suggestions: Array.isArray(item.suggestions) ? item.suggestions : []
          }))
        };
      }
    }
  } catch (e: any) {
    // If name fixing fails, continue with original deckText (graceful degradation)
    console.warn('[deck/analyze] Name fixing failed, continuing with original names:', e?.message);
  }

  // Re-parse with potentially corrected deckText
  const correctedParsed = parseDeckText(deckText);
  const entries = correctedParsed.map(({ name, qty }) => ({ name, count: qty }));
  const uniqueNames = Array.from(new Set(entries.map((e) => e.name))).slice(0, 160);
  const byName = new Map<string, SfCard>();
  const lockedNormalized = new Set<string>();
  if (Array.isArray(body.lockCards)) {
    for (const item of body.lockCards) {
      if (typeof item === "string" && item.trim()) {
        lockedNormalized.add(normalizeCardName(item));
      }
    }
  }

  if (useScryfall && uniqueNames.length) {
    const batch = await fetchCardsBatch(uniqueNames);
    for (const card of batch.values()) {
      byName.set(card.name.toLowerCase(), card);
    }
  }

  const reqCommander = typeof body.commander === "string" && body.commander.trim() ? body.commander.trim() : null;
  const explicitColors = Array.isArray(body.colors) ? body.colors : [];

  const context = await inferDeckContext(
    deckText,
    body.userMessage,
    entries,
    format,
    reqCommander,
    explicitColors,
    byName,
    { plan: body.plan ?? "Optimized", currency: (body.currency as any) ?? "USD" }
  );

  const commanderProfile = getCommanderProfileData(context.commander, context);

  const totals = deckTally(entries, byName);
  const totalCardCount = entries.reduce((sum, e) => sum + e.count, 0);
  const bands = computeBands(format, totalCardCount, totals.lands, totals.ramp, totals.draw, totals.removal);
  const score = Math.round((bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20);

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  const landThreshold =
    format === "Commander"
      ? 34
      : format === "Modern" || format === "Pioneer"
      ? 22
      : 23;
  const landProfileSignature = [
    context.archetype || "",
    commanderProfile?.plan || "",
    commanderProfile?.notes || "",
    (commanderProfile?.preferTags || []).join(" "),
    String((context as any)?.commanderProvidesRamp || ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const commanderIsLandMatters = /landfall|lands?-matter|extra lands|land recursion|play additional lands|land engine|land ramp|lands strategy/.test(
    landProfileSignature
  );
  if (totals.lands >= landThreshold) {
     whatsGood.push("Mana base looks stable for this format.");
   } else {
    if (
      format === "Commander" &&
      totals.lands < 34 &&
      !commanderIsLandMatters
    ) {
      quickFixes.push("Commander decks stumble with fewer than 34 lands; raise the count unless your commander is a dedicated land engine.");
    } else {
      quickFixes.push("Add a few more lands to smooth your opening hands.");
    }
  }
  if (totals.draw >= 8) {
    whatsGood.push("Card draw density is healthy.");
  } else {
    quickFixes.push("Consider a couple more draw spells to keep gas flowing.");
  }
  if (totals.removal >= 5) {
    whatsGood.push("Interaction package covers common threats.");
  } else {
    quickFixes.push("Add targeted removal so you can answer opposing threats on time.");
  }

  if (format === "Commander" && totals.ramp < 4) {
    quickFixes.push("Most Commander decks use at least 8 ramp sources; look at land-based ramp, mana rocks, or dorks to hit that baseline.");
  }

  let suggestions: CardSuggestion[] = [];
  let filtered: FilteredCandidate[] = [];
  let required = 0;
  let filled = 0;
  const suggestionDebugReasons = new Set<string>();
  let postFilteredCount = 0;

  // Load deck analysis system prompt for potential future use in internal functions
  let deckAnalysisSystemPrompt: string | null = null;
  try {
    const promptVersion = await getPromptVersion("deck_analysis");
    if (promptVersion) {
      deckAnalysisSystemPrompt = promptVersion.system_prompt;
    }
  } catch (e) {
    console.warn("[deck/analyze] Failed to load deck analysis prompt:", e);
  }

  if (useGPT) {
    const slots = await planSuggestionSlots(deckText, body.userMessage, context, deckAnalysisSystemPrompt);
    let validation = await validateSlots(slots, context, entries, byName, deckText, body.userMessage, lockedNormalized, false, deckAnalysisSystemPrompt);
    let normalizedDeck = new Set(entries.map((e) => normalizeCardName(e.name)));
    let profile = commanderProfile;
    let post = await postFilterSuggestions(validation.suggestions, context, byName, normalizedDeck, body.currency ?? "USD", entries, null, profile, lockedNormalized);
    suggestions = post.final;
    filtered = validation.filtered;
    required = validation.required;
    filled = validation.filled;
    post.debug.forEach((reason) => suggestionDebugReasons.add(reason));
    postFilteredCount += post.removedCount;

    if (suggestions.length === 0 && validation.suggestions.length > 0) {
      // Retry with stricter instructions
      validation = await validateSlots(slots, context, entries, byName, deckText, body.userMessage, lockedNormalized, true, deckAnalysisSystemPrompt);
      normalizedDeck = new Set(entries.map((e) => normalizeCardName(e.name)));
      profile = getCommanderProfileData(context.commander, context);
      post = await postFilterSuggestions(validation.suggestions, context, byName, normalizedDeck, body.currency ?? "USD", entries, null, profile, lockedNormalized);
      suggestions = post.final;
      filtered = filtered.concat(validation.filtered);
      post.debug.forEach((reason) => suggestionDebugReasons.add(reason));
      postFilteredCount += post.removedCount;

      if (suggestions.length === 0) {
        suggestions.push({
          card: "N/A",
          reason: "All suggested cards were off-color or banned. The model will retry with stricter rules.",
          needs_review: true,
        });
      }
    }
  }

  if (suggestions.length > 1) {
    suggestions = rebalanceSuggestionsByCategory(suggestions);
  }

  const note = totals.draw < 6 ? "needs a touch more draw" : totals.lands < (format === "Commander" ? 32 : 21) ? "mana base is light" : "solid, room to tune";
  const filterSummary = buildFilterSummary(filtered, postFilteredCount, suggestionDebugReasons);

  // Generate validated full text analysis (if GPT is enabled and we have a system prompt)
  let validatedAnalysis: {
    text?: string;
    json?: any;
    validationErrors?: string[];
    validationWarnings?: string[];
  } | null = null;

  if (useGPT && deckAnalysisSystemPrompt) {
    try {
      const { generateValidatedDeckAnalysis } = await import("@/lib/deck/analysis-with-validation");

      const analysisOptions = {
        systemPrompt: deckAnalysisSystemPrompt,
        deckText,
        context,
        userMessage: body.userMessage,
        commanderProfile,
        // Note: temperature removed - not supported by this model
        maxTokens: 2000,
      };

      const validationContext = {
        format,
        commander: context.commander || null,
        colors: context.colors || [],
        deckText,
      };

      const result = await generateValidatedDeckAnalysis(analysisOptions, validationContext);
      
      validatedAnalysis = {
        text: result.text,
        json: result.json,
        validationErrors: result.validationErrors,
        validationWarnings: result.validationWarnings,
      };

      // If validation failed completely, log it but don't fail the request
      if (result.validationErrors.length > 0) {
        console.warn("[deck/analyze] Validation errors:", result.validationErrors);
      }
    } catch (error) {
      console.error("[deck/analyze] Failed to generate validated analysis:", error);
      // Don't fail the request if analysis generation fails - return suggestions anyway
    }
  }

  return new Response(
    JSON.stringify({
    score,
    note,
    bands,
      counts: { lands: totals.lands, ramp: totals.ramp, draw: totals.draw, removal: totals.removal },
      whatsGood,
      quickFixes,
      curveBuckets: totals.curve,
      suggestions,
      partial: required > 0 && filled < required,
      tokenNeeds: [],
      metaHints: [],
      combosPresent: [],
      combosMissing: [],
      filteredSummary: filterSummary.summaryText,
      filteredReasons: filterSummary.reasons,
      filteredCount: filterSummary.count,
      debug: {
        filteredCandidates: filtered,
        filterReasons: Array.from(suggestionDebugReasons),
      },
      prompt_version: useGPT ? (promptVersionId || getActivePromptVersion()) : undefined,
      prompt_version_id: promptVersionId || undefined,
      // Add name fixing info if cards were corrected
      ...(nameFixInfo ? {
        nameFixes: nameFixInfo.items,
        nameFixesCount: nameFixInfo.fixed,
      } : {}),
      // Add validated analysis if available
      ...(validatedAnalysis ? {
        analysis: validatedAnalysis.text,
        analysis_json: validatedAnalysis.json,
        analysis_validation_errors: validatedAnalysis.validationErrors,
        analysis_validation_warnings: validatedAnalysis.validationWarnings,
      } : {}),
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
