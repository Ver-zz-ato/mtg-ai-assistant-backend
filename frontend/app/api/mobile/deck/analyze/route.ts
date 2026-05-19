import { NextRequest, NextResponse } from "next/server";
import { runDeckAnalyzeCore } from "@/app/api/deck/analyze/route";
import { generateAppSafeDeckExplanation } from "@/lib/deck/analyze-app-explainer";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { rowsToDeckTextForAnalysis } from "@/lib/deck/formatCompliance";
import { deckHash } from "@/lib/deck/deck-context-summary";
import { getServerSupabase } from "@/lib/server-supabase";
import { hashCacheKey, supabaseCacheGet, supabaseCacheSet } from "@/lib/utils/supabase-cache";

export const runtime = "nodejs";
const MOBILE_ANALYZE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MOBILE_ANALYZE_CACHE_VERSION = 5;

type MobileAnalyzeCounts = {
  lands?: number;
  ramp?: number;
  draw?: number;
  removal?: number;
};

type MobileAnalyzeBenchKey = "mana" | "ramp" | "draw" | "removal" | "curve";

type MobileAnalyzeBenchItem = {
  key: MobileAnalyzeBenchKey;
  label: string;
  count?: number | null;
  score?: number | null;
  status: "low" | "healthy" | "high" | "unknown";
  note: string;
};

type MobileAnalyzeBenchmarkingEntry = {
  rating: "low" | "healthy" | "high" | "unknown";
  explanation: string;
  recommendation?: string | null;
};

type MobileAnalyzePressurePoint = {
  title: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  mitigation?: string | null;
};

type MobileAnalyzeImpactPlanItem = {
  title: string;
  whyItMatters: string;
  expectedImpact: "high" | "medium" | "low";
  relatedCards: string[];
};

type MobileAnalyzeThreatProfile = {
  primaryPlan: string;
  secondaryPlan?: string | null;
  pressureStyle: string;
  winConditionType: string;
  speedEstimate: string;
};

type MobileAnalyzeConfidence = {
  rating: "high" | "medium" | "low";
  reasons: string[];
  missingData: string[];
};

type AppSafeAnalysisShape = Awaited<ReturnType<typeof generateAppSafeDeckExplanation>>;

type MobileAnalyzeProAnalysis = {
  strategicSummary?: string | null;
  diagnostics?: {
    summary: string | null;
    counts?: MobileAnalyzeCounts;
    bands?: Record<string, number>;
    score?: number | null;
  };
  curve?: {
    buckets: Array<{ label: string; count: number }>;
    dominantBucket: string | null;
    note: string | null;
  };
  density?: {
    summary: string | null;
    items: MobileAnalyzeBenchItem[];
  };
  filteredAnalysis?: {
    summary: string | null;
    reasons: string[];
    count?: number | null;
  };
  benchmarks?: {
    items: MobileAnalyzeBenchItem[];
  };
  benchmarking?: {
    interactionDensity: MobileAnalyzeBenchmarkingEntry;
    rampDensity: MobileAnalyzeBenchmarkingEntry;
    drawDensity: MobileAnalyzeBenchmarkingEntry;
    protectionDensity: MobileAnalyzeBenchmarkingEntry;
    curvePressure: MobileAnalyzeBenchmarkingEntry;
    topEndGreed: MobileAnalyzeBenchmarkingEntry;
    consistencyRisk: MobileAnalyzeBenchmarkingEntry;
  };
  pressurePoints?: MobileAnalyzePressurePoint[];
  impactPlan?: MobileAnalyzeImpactPlanItem[];
  gameStages?: {
    earlyGame: string[];
    midGame: string[];
    lateGame: string[];
  };
  threatProfile?: MobileAnalyzeThreatProfile;
  confidence?: MobileAnalyzeConfidence;
  caveats?: {
    confidence: "high" | "medium" | "low";
    items: string[];
    note: string | null;
  };
};

function pickTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function parseFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseCounts(raw: unknown): MobileAnalyzeCounts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const out: MobileAnalyzeCounts = {};
  for (const key of ["lands", "ramp", "draw", "removal"] as const) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseBands(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseCurveBuckets(raw: unknown): number[] | undefined {
  return Array.isArray(raw) && raw.every((n) => typeof n === "number" && Number.isFinite(n))
    ? (raw as number[])
    : undefined;
}

function clampPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function bandStatus(
  value: number | null | undefined
): "low" | "healthy" | "high" | "unknown" {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value < 0.45) return "low";
  if (value > 0.82) return "high";
  return "healthy";
}

function countStatus(
  label: MobileAnalyzeBenchKey,
  count: number | null | undefined,
  format: string | null
): "low" | "healthy" | "high" | "unknown" {
  if (typeof count !== "number" || !Number.isFinite(count)) return "unknown";
  const commander = (format ?? "").toLowerCase() === "commander";
  if (label === "removal") {
    if (count < (commander ? 8 : 5)) return "low";
    if (count > (commander ? 14 : 10)) return "high";
    return "healthy";
  }
  if (label === "ramp") {
    if (count < (commander ? 8 : 4)) return "low";
    if (count > (commander ? 14 : 8)) return "high";
    return "healthy";
  }
  if (label === "draw") {
    if (count < (commander ? 8 : 4)) return "low";
    if (count > (commander ? 14 : 8)) return "high";
    return "healthy";
  }
  if (label === "mana") {
    if (count < (commander ? 35 : 23)) return "low";
    if (count > (commander ? 40 : 27)) return "high";
    return "healthy";
  }
  return "unknown";
}

function benchmarkNote(
  label: MobileAnalyzeBenchKey,
  status: "low" | "healthy" | "high" | "unknown"
): string {
  const subject =
    label === "mana"
      ? "Mana base"
      : label === "removal"
      ? "Interaction/removal"
      : label === "ramp"
      ? "Ramp"
      : label === "draw"
      ? "Card draw"
      : "Curve";
  if (status === "low") return `${subject} looks light and may create consistency issues.`;
  if (status === "high") return `${subject} looks well-supported, but check for crowding against the main game plan.`;
  if (status === "healthy") return `${subject} lands in a healthy range for this shell.`;
  return `${subject} could not be benchmarked confidently from the available data.`;
}

function normalizeTextArray(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function uniqueStrings(values: Array<string | null | undefined>, max = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function recommendationForStatus(
  label: string,
  status: "low" | "healthy" | "high" | "unknown"
): string | null {
  if (status === "low") return `Prioritize ${label.toLowerCase()} before adding more win-more slots.`;
  if (status === "high") return `Avoid adding more ${label.toLowerCase()} unless it clearly fixes a specific weakness.`;
  if (status === "healthy") return `Keep this area stable while improving weaker structural points first.`;
  return "Treat this as directional until more deck structure data is available.";
}

function buildBenchmarkingEntry(params: {
  rating: "low" | "healthy" | "high" | "unknown";
  explanation: string;
  recommendationLabel?: string;
  recommendation?: string | null;
}): MobileAnalyzeBenchmarkingEntry {
  return {
    rating: params.rating,
    explanation: params.explanation,
    recommendation:
      params.recommendation ??
      (params.recommendationLabel
        ? recommendationForStatus(params.recommendationLabel, params.rating)
        : null),
  };
}

function deriveProtectionStatus(args: {
  textBlob: string;
  archetype: string | null;
  gamePlan: string | null;
  suggestionSignals: string[];
}): "low" | "healthy" | "unknown" {
  const lower = args.textBlob;
  if (
    includesAny(lower, [
      "protect",
      "vulnerable",
      "board wipe",
      "wipes",
      "over-reliant on commander",
      "commander",
      "setup pieces",
    ])
  ) {
    return "low";
  }
  if (
    includesAny(
      normalizeTextArray([args.archetype ?? "", args.gamePlan ?? "", ...args.suggestionSignals]),
      ["protect", "protection", "shield", "keep key pieces alive", "recursion"]
    )
  ) {
    return "healthy";
  }
  return "unknown";
}

function deriveThreatProfile(args: {
  archetype: string | null;
  gamePlan: string | null;
  summary: string | null;
  curveBuckets?: number[];
  counts?: MobileAnalyzeCounts;
}): MobileAnalyzeThreatProfile {
  const blob = normalizeTextArray([args.archetype, args.gamePlan, args.summary]);
  const topEnd = args.curveBuckets?.length ? args.curveBuckets[args.curveBuckets.length - 1] ?? 0 : 0;
  const lowCurve = args.curveBuckets?.slice(0, 2).reduce((sum, n) => sum + n, 0) ?? 0;
  const primaryPlan =
    args.archetype?.trim() ||
    (includesAny(blob, ["combo"]) ? "Combo-oriented shell" :
    includesAny(blob, ["sacrifice", "aristocrat"]) ? "Aristocrats / attrition shell" :
    includesAny(blob, ["control"]) ? "Control shell" :
    includesAny(blob, ["midrange", "value"]) ? "Value-midrange shell" :
    includesAny(blob, ["token", "go wide"]) ? "Go-wide board plan" :
    "Synergy-driven shell");
  const secondaryPlan =
    includesAny(blob, ["draw", "value", "advantage"])
      ? "Incremental value backup plan"
      : includesAny(blob, ["commander", "engine"])
      ? "Commander-led engine backup plan"
      : null;
  const pressureStyle =
    includesAny(blob, ["tempo", "cheap interaction"]) ? "Tempo and stack pressure" :
    includesAny(blob, ["token", "combat", "board"]) ? "Board-centric pressure" :
    includesAny(blob, ["combo"]) ? "Engine/combo pressure" :
    "Incremental advantage";
  const winConditionType =
    includesAny(blob, ["combo"]) ? "Engine combo finish" :
    includesAny(blob, ["combat", "token", "attack"]) ? "Combat damage finish" :
    topEnd >= 12 ? "Top-end haymaker finish" :
    "Value-driven closeout";
  const speedEstimate =
    lowCurve >= 18 && (args.counts?.ramp ?? 0) >= 8
      ? "Fast setup"
      : topEnd >= 16
      ? "Slower setup, stronger late game"
      : "Mid-speed setup";
  return {
    primaryPlan,
    secondaryPlan,
    pressureStyle,
    winConditionType,
    speedEstimate,
  };
}

function suggestionCardsBySignal(
  suggestions: Array<{ card?: string; category?: string; slotRole?: string; requestedType?: string; reason?: string }>,
  keywords: string[],
  max = 3
): string[] {
  const matched = suggestions
    .filter((suggestion) => {
      const haystack = normalizeTextArray([
        suggestion.category,
        suggestion.slotRole,
        suggestion.requestedType,
        suggestion.reason,
        suggestion.card,
      ]);
      return includesAny(haystack, keywords);
    })
    .map((suggestion) => suggestion.card ?? null);
  return uniqueStrings(matched, max);
}

function curveLabelsForBuckets(count: number): string[] {
  if (count <= 0) return [];
  const base = ["0-1 mana", "2 mana", "3 mana", "4 mana"];
  const labels = [...base];
  while (labels.length < count - 1) labels.push(`${labels.length + 1} mana`);
  labels.push("5+ mana");
  return labels.slice(0, count);
}

function buildCurveNote(
  buckets: number[] | undefined,
  manaBand: number | null | undefined,
  curveBand: number | null | undefined
): { buckets: Array<{ label: string; count: number }>; dominantBucket: string | null; note: string | null } {
  const curve = buckets ?? [];
  const labels = curveLabelsForBuckets(curve.length);
  const mapped = curve.map((count, index) => ({
    label: labels[index] ?? `Bucket ${index + 1}`,
    count,
  }));
  if (mapped.length === 0) {
    return {
      buckets: [],
      dominantBucket: null,
      note: manaBand != null || curveBand != null ? "Curve detail was not available for this run." : null,
    };
  }
  const dominant = mapped.reduce((best, entry) => (entry.count > best.count ? entry : best), mapped[0]);
  const manaStatus = bandStatus(manaBand);
  const curveStatus = bandStatus(curveBand);
  let note = `The list leans most heavily on ${dominant.label}.`;
  if (curveStatus === "low") note += " The curve profile looks uneven and may slow early setup.";
  else if (curveStatus === "high") note += " The curve profile looks smooth for its plan.";
  if (manaStatus === "low") note += " Mana support looks stretched for that curve.";
  else if (manaStatus === "healthy" || manaStatus === "high") note += " Mana support should keep pace if sequencing is clean.";
  return { buckets: mapped, dominantBucket: dominant.label, note };
}

function benchmarkEntryExplanation(
  label: string,
  rating: "low" | "healthy" | "high" | "unknown",
  detail: string
): string {
  if (rating === "low") return `${label} is below a comfortable range. ${detail}`;
  if (rating === "high") return `${label} is above the usual comfort band. ${detail}`;
  if (rating === "healthy") return `${label} is in a healthy range. ${detail}`;
  return `${label} could not be benchmarked tightly. ${detail}`;
}

function buildImpactPlan(input: {
  counts?: MobileAnalyzeCounts;
  curveBuckets?: number[];
  suggestions: Array<{ card?: string; category?: string; slotRole?: string; requestedType?: string; reason?: string }>;
  benchmarking: NonNullable<MobileAnalyzeProAnalysis["benchmarking"]>;
  pressurePoints: MobileAnalyzePressurePoint[];
}): MobileAnalyzeImpactPlanItem[] {
  const out: MobileAnalyzeImpactPlanItem[] = [];
  if (input.benchmarking.consistencyRisk.rating === "high" || input.benchmarking.consistencyRisk.rating === "low") {
    out.push({
      title: "Tighten early consistency",
      whyItMatters: "Stumbles in mana or setup make the rest of the deck play a full turn slower.",
      expectedImpact: "high",
      relatedCards: suggestionCardsBySignal(input.suggestions, ["land", "mana", "ramp", "fixing"], 3),
    });
  }
  if (input.benchmarking.interactionDensity.rating === "low") {
    out.push({
      title: "Increase cheap interaction",
      whyItMatters: "Your current interaction profile leaves faster starts and early engines unchecked too often.",
      expectedImpact: "high",
      relatedCards: suggestionCardsBySignal(input.suggestions, ["interaction", "removal", "instant"], 3),
    });
  }
  if (input.benchmarking.drawDensity.rating === "low") {
    out.push({
      title: "Add more repeatable card flow",
      whyItMatters: "More draw improves recovery after trades and helps you hit the right support pieces on time.",
      expectedImpact: "medium",
      relatedCards: suggestionCardsBySignal(input.suggestions, ["draw", "advantage", "engine"], 3),
    });
  }
  if (input.benchmarking.topEndGreed.rating === "high") {
    out.push({
      title: "Trim the top end",
      whyItMatters: "Too many expensive slots increase dead early hands and reduce your ability to stabilize under pressure.",
      expectedImpact: "medium",
      relatedCards: suggestionCardsBySignal(input.suggestions, ["cheap", "low-commitment", "instant", "ramp"], 3),
    });
  }
  if (input.benchmarking.protectionDensity.rating === "low") {
    out.push({
      title: "Protect your key engine turns",
      whyItMatters: "If the deck leans on a commander or engine piece, losing that turn cycle often resets your tempo.",
      expectedImpact: "medium",
      relatedCards: suggestionCardsBySignal(input.suggestions, ["protection", "shield", "recursion"], 3),
    });
  }
  for (const point of input.pressurePoints) {
    if (out.length >= 4) break;
    if (out.some((item) => item.title.toLowerCase().includes(point.title.toLowerCase()))) continue;
    out.push({
      title: point.title,
      whyItMatters: point.explanation,
      expectedImpact: point.severity === "high" ? "high" : point.severity === "medium" ? "medium" : "low",
      relatedCards: [],
    });
  }
  return out.slice(0, 4);
}

function buildGameStages(input: {
  counts?: MobileAnalyzeCounts;
  curveBuckets?: number[];
  archetype: string | null;
  gamePlan: string | null;
  benchmarking: NonNullable<MobileAnalyzeProAnalysis["benchmarking"]>;
  threatProfile: MobileAnalyzeThreatProfile;
}): { earlyGame: string[]; midGame: string[]; lateGame: string[] } {
  const earlyGame = uniqueStrings([
    input.benchmarking.rampDensity.rating === "low"
      ? "Prioritize clean land drops first, then use your cheapest setup pieces to avoid falling behind."
      : "Develop mana early so the rest of the shell can come online on curve.",
    input.benchmarking.interactionDensity.rating === "low"
      ? "Respect fast starts and avoid keeping hands that cannot affect the board early."
      : "Use early interaction to preserve tempo while your main plan comes together.",
    input.threatProfile.primaryPlan ? `Identify which opening hand best supports the ${input.threatProfile.primaryPlan.toLowerCase()} plan.` : null,
  ], 3);
  const midGame = uniqueStrings([
    "Convert setup into board control or value before committing your most important payoff turn.",
    input.gamePlan ? `Lean into the core plan: ${input.gamePlan}` : null,
    input.benchmarking.drawDensity.rating === "low"
      ? "Sequence card flow carefully so you do not run out of gas after the first exchange."
      : "Use your card flow to keep pressure up while covering weak spots.",
  ], 3);
  const lateGame = uniqueStrings([
    input.threatProfile.winConditionType ? `Turn your established engine into a ${input.threatProfile.winConditionType.toLowerCase()}.` : null,
    input.benchmarking.topEndGreed.rating === "high"
      ? "Do not strand expensive closers in hand; stabilize first, then commit one finisher at a time."
      : "Once stable, pivot from value generation into closing pressure instead of overextending.",
    input.benchmarking.protectionDensity.rating === "low"
      ? "Plan for your key payoff turn to be contested and hold back backup resources when possible."
      : "Protect the closing turn rather than adding extra setup once you are ahead.",
  ], 3);
  return { earlyGame, midGame, lateGame };
}

function buildPressurePoints(input: {
  counts?: MobileAnalyzeCounts;
  curveBuckets?: number[];
  benchmarking: NonNullable<MobileAnalyzeProAnalysis["benchmarking"]>;
  mainProblems: string[];
  threatProfile: MobileAnalyzeThreatProfile;
}): MobileAnalyzePressurePoint[] {
  const out: MobileAnalyzePressurePoint[] = [];
  const addPoint = (point: MobileAnalyzePressurePoint) => {
    if (!out.some((item) => item.title === point.title)) out.push(point);
  };
  if (input.benchmarking.interactionDensity.rating === "low") {
    addPoint({
      title: "Weak to fast creature pressure",
      severity: "high",
      explanation: "Low early interaction makes it easier for aggressive starts to snowball before your deck's main engine is online.",
      mitigation: "Raise the density of cheap removal or blockers that buy time.",
    });
  }
  if (input.benchmarking.consistencyRisk.rating === "high" || input.benchmarking.consistencyRisk.rating === "low") {
    addPoint({
      title: "Inconsistent early mana",
      severity: "high",
      explanation: "Your structure suggests early turns can stumble, especially when hands need both setup and color access quickly.",
      mitigation: "Improve mana stability or add more early ramp/fixing.",
    });
  }
  if (input.benchmarking.topEndGreed.rating === "high") {
    addPoint({
      title: "Vulnerable before setup",
      severity: "medium",
      explanation: "A heavier top end increases the number of hands that do not stabilize early enough under pressure.",
      mitigation: "Trade some expensive payoff slots for cheaper bridge cards.",
    });
  }
  if (input.benchmarking.drawDensity.rating === "low") {
    addPoint({
      title: "Low recovery after wipes",
      severity: "medium",
      explanation: "If the first wave is answered, limited card flow makes it harder to rebuild the board or refuel efficiently.",
      mitigation: "Add more repeatable draw or recursion that works from behind.",
    });
  }
  if (input.benchmarking.protectionDensity.rating === "low") {
    addPoint({
      title: "Over-reliant on commander or key engine pieces",
      severity: "medium",
      explanation: "The current shell appears to rely heavily on sticking a central piece without much insulation.",
      mitigation: "Increase protection, redundancy, or recovery lines for key turns.",
    });
  }
  for (const line of input.mainProblems.slice(0, 3)) {
    const lowered = line.toLowerCase();
    if (includesAny(lowered, ["wipe", "board wipe"])) {
      addPoint({
        title: "Weak to repeated board wipes",
        severity: "medium",
        explanation: line,
        mitigation: "Hold back follow-up resources and add recovery pieces where possible.",
      });
    } else if (includesAny(lowered, ["mana", "land"])) {
      addPoint({
        title: "Mana setup risk",
        severity: "medium",
        explanation: line,
        mitigation: "Use early fixes and smoother land counts to reduce slow starts.",
      });
    }
  }
  return out.slice(0, 4);
}

function buildProAnalysis(input: {
  score: number | null;
  counts?: MobileAnalyzeCounts;
  bands?: Record<string, number>;
  curveBuckets?: number[];
  filteredSummary: string | null;
  filteredReasons: string[];
  filteredCount: number | null;
  validationErrors: string[];
  validationWarnings: string[];
  format: string | null;
  commander: string | null;
  analysis: AppSafeAnalysisShape | null;
  suggestions: Array<{ card?: string; reason?: string; category?: string; slotRole?: string; requestedType?: string }>;
}): MobileAnalyzeProAnalysis | null {
  const {
    score,
    counts,
    bands,
    curveBuckets,
    filteredSummary,
    filteredReasons,
    filteredCount,
    validationErrors,
    validationWarnings,
    format,
    commander,
    analysis,
    suggestions,
  } = input;
  const manaScore = clampPercent(bands?.mana);
  const rampScore = clampPercent(bands?.ramp);
  const drawScore = clampPercent(bands?.draw);
  const removalScore = clampPercent(bands?.removal);
  const curveScore = clampPercent(bands?.curve);
  const problemsText = analysis?.main_problems ?? [];
  const strategicBlob = normalizeTextArray([
    analysis?.summary ?? "",
    analysis?.archetype ?? "",
    analysis?.game_plan ?? "",
    ...problemsText,
    ...(analysis?.priority_actions ?? []),
    ...filteredReasons,
    ...validationWarnings,
  ]);
  const protectionSignals = suggestions
    .filter((suggestion) =>
      includesAny(
        normalizeTextArray([
          suggestion.category,
          suggestion.slotRole,
          suggestion.requestedType,
          suggestion.reason,
        ]),
        ["protection", "shield", "recursion"]
      )
    )
    .map((suggestion) => suggestion.card ?? null);

  const threatProfile = deriveThreatProfile({
    archetype: analysis?.archetype ?? null,
    gamePlan: analysis?.game_plan ?? null,
    summary: analysis?.summary ?? null,
    curveBuckets,
    counts,
  });
  const protectionStatus = deriveProtectionStatus({
    textBlob: strategicBlob,
    archetype: analysis?.archetype ?? null,
    gamePlan: analysis?.game_plan ?? null,
    suggestionSignals: protectionSignals.filter((value): value is string => Boolean(value)),
  });
  const topEndCount = curveBuckets?.length ? curveBuckets[curveBuckets.length - 1] ?? 0 : 0;
  const topEndStatus: "low" | "healthy" | "high" | "unknown" =
    topEndCount <= 0
      ? "unknown"
      : topEndCount >= 18
      ? "high"
      : topEndCount >= 10
      ? "healthy"
      : "low";
  const consistencyStatus: "low" | "healthy" | "high" | "unknown" =
    (counts?.lands ?? 0) > 0 && ((manaScore != null && manaScore < 45) || (rampScore != null && rampScore < 45))
      ? "high"
      : manaScore != null && rampScore != null && manaScore >= 55 && rampScore >= 55
      ? "healthy"
      : manaScore != null || rampScore != null
      ? "low"
      : "unknown";

  const benchmarking = {
    interactionDensity: buildBenchmarkingEntry({
      rating: countStatus("removal", counts?.removal ?? null, format),
      explanation: benchmarkEntryExplanation(
        "Interaction density",
        countStatus("removal", counts?.removal ?? null, format),
        "This mostly affects how well the deck can stop opposing pressure before its own plan is established."
      ),
      recommendationLabel: "cheap interaction",
    }),
    rampDensity: buildBenchmarkingEntry({
      rating: countStatus("ramp", counts?.ramp ?? null, format),
      explanation: benchmarkEntryExplanation(
        "Ramp density",
        countStatus("ramp", counts?.ramp ?? null, format),
        "This affects whether your key turns arrive on time or one turn behind the table."
      ),
      recommendationLabel: "ramp",
    }),
    drawDensity: buildBenchmarkingEntry({
      rating: countStatus("draw", counts?.draw ?? null, format),
      explanation: benchmarkEntryExplanation(
        "Draw density",
        countStatus("draw", counts?.draw ?? null, format),
        "This shapes how well the deck can keep pace after the first exchange of resources."
      ),
      recommendationLabel: "card flow",
    }),
    protectionDensity: buildBenchmarkingEntry({
      rating: protectionStatus,
      explanation: benchmarkEntryExplanation(
        "Protection density",
        protectionStatus,
        commander
          ? `This matters more because ${commander} appears to be a meaningful part of the shell's pressure or engine.`
          : "This matters most when the deck relies on one engine or payoff to convert setup into pressure."
      ),
      recommendationLabel: "protection",
    }),
    curvePressure: buildBenchmarkingEntry({
      rating: bandStatus(bands?.curve),
      explanation: benchmarkEntryExplanation(
        "Curve pressure",
        bandStatus(bands?.curve),
        "Heavier curves increase the number of turns where the deck is forced to tap out before stabilizing."
      ),
      recommendationLabel: "curve smoothing",
    }),
    topEndGreed: buildBenchmarkingEntry({
      rating: topEndStatus,
      explanation: benchmarkEntryExplanation(
        "Top-end greed",
        topEndStatus,
        "This reflects how many expensive cards compete for the same late-game mana window."
      ),
      recommendationLabel: "top-end slots",
    }),
    consistencyRisk: buildBenchmarkingEntry({
      rating: consistencyStatus,
      explanation:
        consistencyStatus === "high"
          ? "The deck is structurally at risk of stumbling before its strongest turns matter."
          : consistencyStatus === "healthy"
          ? "The current mana and setup profile should support the plan reliably."
          : consistencyStatus === "low"
          ? "Consistency risk is present, but not severe enough to dominate the whole plan."
          : "Consistency risk could not be benchmarked tightly from the available data.",
      recommendation: consistencyStatus === "healthy" ? "Preserve this baseline while upgrading weaker categories." : "Fix consistency first because other upgrades compound better once the shell starts on time.",
    }),
  } satisfies NonNullable<MobileAnalyzeProAnalysis["benchmarking"]>;

  const benchmarkItems: MobileAnalyzeBenchItem[] = [
    {
      key: "mana",
      label: "Mana base",
      count: counts?.lands ?? null,
      score: manaScore,
      status: countStatus("mana", counts?.lands ?? null, format),
      note: benchmarkNote("mana", countStatus("mana", counts?.lands ?? null, format)),
    },
    {
      key: "ramp",
      label: "Ramp density",
      count: counts?.ramp ?? null,
      score: rampScore,
      status: countStatus("ramp", counts?.ramp ?? null, format),
      note: benchmarkNote("ramp", countStatus("ramp", counts?.ramp ?? null, format)),
    },
    {
      key: "draw",
      label: "Draw density",
      count: counts?.draw ?? null,
      score: drawScore,
      status: countStatus("draw", counts?.draw ?? null, format),
      note: benchmarkNote("draw", countStatus("draw", counts?.draw ?? null, format)),
    },
    {
      key: "removal",
      label: "Interaction density",
      count: counts?.removal ?? null,
      score: removalScore,
      status: countStatus("removal", counts?.removal ?? null, format),
      note: benchmarkNote("removal", countStatus("removal", counts?.removal ?? null, format)),
    },
    {
      key: "curve",
      label: "Curve balance",
      count: null,
      score: curveScore,
      status: bandStatus(bands?.curve),
      note: benchmarkNote("curve", bandStatus(bands?.curve)),
    },
  ];

  const curve = buildCurveNote(curveBuckets, bands?.mana, bands?.curve);
  const pressurePoints = buildPressurePoints({
    counts,
    curveBuckets,
    benchmarking,
    mainProblems: problemsText,
    threatProfile,
  });
  const impactPlan = buildImpactPlan({
    counts,
    curveBuckets,
    suggestions,
    benchmarking,
    pressurePoints,
  });
  const gameStages = buildGameStages({
    counts,
    curveBuckets,
    archetype: analysis?.archetype ?? null,
    gamePlan: analysis?.game_plan ?? null,
    benchmarking,
    threatProfile,
  });
  const caveatItems = [
    ...validationWarnings.map((warning) => `Validation warning: ${warning}`),
    ...validationErrors.map((error) => `Validation issue: ${error}`),
  ];
  if (!counts && !bands && !curveBuckets?.length) {
    caveatItems.push("Deterministic diagnostics were limited on this run, so benchmark confidence is lower.");
  }
  const confidence: "high" | "medium" | "low" =
    validationErrors.length > 0 ? "low" : validationWarnings.length > 0 ? "medium" : "high";
  const confidenceReasons = uniqueStrings([
    counts ? "Counts-based diagnostics are available." : null,
    bands ? "Analyzer bands are available for structure benchmarking." : null,
    curveBuckets?.length ? "Curve bucket data is available." : null,
    analysis?.archetype ? "Archetype signal is present." : null,
    analysis?.game_plan ? "Game-plan signal is present." : null,
  ], 5);
  const confidenceMissingData = uniqueStrings([
    !counts ? "Missing counts payload for lands/ramp/draw/removal." : null,
    !bands ? "Missing analyzer band data." : null,
    !curveBuckets?.length ? "Missing curve bucket data." : null,
    protectionStatus === "unknown" ? "Protection density is heuristic because there is no direct protection count." : null,
  ], 5);

  const diagnosticsSummaryParts = [
    typeof score === "number" ? `Analyzer score ${score}/100.` : null,
    manaScore != null ? `Mana ${manaScore}%.` : null,
    rampScore != null ? `Ramp ${rampScore}%.` : null,
    drawScore != null ? `Draw ${drawScore}%.` : null,
    removalScore != null ? `Removal ${removalScore}%.` : null,
  ].filter(Boolean);

  const hasAnyData =
    Boolean(counts) ||
    Boolean(bands) ||
    Boolean(curve.buckets.length) ||
    Boolean(filteredSummary) ||
    Boolean(analysis?.summary) ||
    pressurePoints.length > 0 ||
    impactPlan.length > 0 ||
    filteredReasons.length > 0 ||
    caveatItems.length > 0;
  if (!hasAnyData) return null;

  return {
    strategicSummary:
      pressurePoints[0]
        ? `${threatProfile.primaryPlan} with ${pressurePoints[0].title.toLowerCase()} as the biggest pressure point right now.`
        : analysis?.summary ?? null,
    diagnostics: {
      summary: diagnosticsSummaryParts.length > 0 ? diagnosticsSummaryParts.join(" ") : null,
      counts,
      bands,
      score,
    },
    curve,
    density: {
      summary:
        benchmarkItems.filter((item) => item.status === "low").length > 0
          ? "One or more core support packages look light for the deck's current shape."
          : "Core support packages mostly land in healthy ranges from the analyzer's deterministic checks.",
      items: benchmarkItems,
    },
    filteredAnalysis:
      filteredSummary || filteredReasons.length > 0 || filteredCount != null
        ? {
            summary: filteredSummary,
            reasons: filteredReasons,
            count: filteredCount,
          }
        : undefined,
    benchmarks: {
      items: benchmarkItems,
    },
    benchmarking,
    pressurePoints,
    impactPlan,
    gameStages,
    threatProfile,
    confidence: {
      rating: confidence,
      reasons: confidenceReasons,
      missingData: confidenceMissingData,
    },
    caveats: {
      confidence,
      items: caveatItems,
      note:
        confidence === "high"
          ? "These notes are based mostly on deterministic deck structure checks."
          : confidence === "medium"
          ? "Some validation warnings reduced confidence in a few sections."
          : "Validation issues reduced confidence; treat these notes as directional.",
    },
  };
}

async function resolveMobileAnalyzeCacheKey(req: NextRequest, parsedBody: Record<string, unknown>): Promise<string | null> {
  const requestFormat = pickTrimmedString(parsedBody.format) ?? "Commander";
  const requestCommander = pickTrimmedString(parsedBody.commander);
  let deckText = pickTrimmedString(parsedBody.deckText) ?? null;
  const auth = await getUserAndSupabase(req).catch(() => null);
  const userIdForScope = auth?.user?.id ?? null;

  if (!deckText && typeof parsedBody.deckId === "string" && parsedBody.deckId.trim()) {
    const { supabase, user } = auth ?? (await getUserAndSupabase(req));
    if (!user) return null;
    const deckId = parsedBody.deckId.trim();
    const { data: deckRow } = await supabase
      .from("decks")
      .select("deck_text, commander, format, user_id")
      .eq("id", deckId)
      .maybeSingle();
    const deck = deckRow as { deck_text?: string | null; commander?: string | null; format?: string | null; user_id?: string | null } | null;
    if (!deck || deck.user_id !== user.id) return null;
    const fmt = pickTrimmedString(parsedBody.format) ?? pickTrimmedString(deck.format) ?? "Commander";
    const { data: cards } = await supabase
      .from("deck_cards")
      .select("name, qty, zone")
      .eq("deck_id", deckId)
      .limit(400);
    if (cards?.length) {
      deckText = rowsToDeckTextForAnalysis(cards as Array<{ name: string; qty: number; zone?: string | null }>, fmt);
    } else {
      deckText = pickTrimmedString(deck.deck_text) ?? null;
    }
  }

  if (!deckText) return null;
  return await hashCacheKey({
    cache_version: MOBILE_ANALYZE_CACHE_VERSION,
    model: "mobile-deck-analyze-response",
    sysPromptHash: "app-safe-explainer",
    intent: "mobile_deck_analyze",
    normalized_user_text: "",
    deck_context_included: true,
    deck_hash: deckHash(deckText),
    tier: "mobile",
    locale: null,
    scope: [
      requestFormat.toLowerCase(),
      requestCommander?.toLowerCase() ?? "",
      pickTrimmedString(parsedBody.sourcePage) ?? pickTrimmedString(parsedBody.source_page) ?? "",
      userIdForScope ?? "guest",
    ].join("|"),
  });
}

export async function POST(req: NextRequest) {
  try {
    let requestMode: "deckId" | "deckText" | "unknown" = "unknown";
    let requestCommander: string | null = null;
    let requestFormat: string | null = null;
    let requestSourcePage: string | null = null;
    let requestUsageSource: string | null = null;
    let isPro = false;
    /** Single read: runDeckAnalyzeCore also needs this JSON for usageSource/sourcePage; a second req.json() can be empty. */
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const hasDeckId = typeof parsedBody.deckId === "string" && parsedBody.deckId.trim().length > 0;
      const hasDeckText =
        typeof parsedBody.deckText === "string" && parsedBody.deckText.trim().length > 0;
      requestMode = hasDeckId ? "deckId" : hasDeckText ? "deckText" : "unknown";
      requestCommander = pickTrimmedString(parsedBody.commander);
      requestFormat = pickTrimmedString(parsedBody.format);
      requestSourcePage =
        pickTrimmedString(parsedBody.sourcePage) ?? pickTrimmedString(parsedBody.source_page);
      const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
      requestUsageSource = resolveAiUsageSourceForRequest(req, parsedBody, null) ?? null;
    } catch {
      requestMode = "unknown";
    }
    console.log("[mobile/deck/analyze][debug] before core", {
      requestMode,
    });
    const auth = await getUserAndSupabase(req).catch(() => null);
    if (auth?.user) {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(auth.user.id);
    }
    const cacheKey = await resolveMobileAnalyzeCacheKey(req, parsedBody).catch(() => null);
    const cacheSupabase = cacheKey ? await getServerSupabase() : null;
    if (cacheKey && cacheSupabase) {
      const cached = await supabaseCacheGet(cacheSupabase, "ai_private_cache", cacheKey);
      if (cached?.text) {
        try {
          const cachedBody = JSON.parse(cached.text) as Record<string, unknown>;
          return NextResponse.json(
            {
              ...cachedBody,
              cacheHit: true,
              cacheKind: "mobile_deck_analyze",
            },
            { status: 200 }
          );
        } catch {
          // Bad cache entry should not block fresh analysis.
        }
      }
    }

    const coreRes = await runDeckAnalyzeCore(req, {
      includeValidatedNarrative: false,
      parsedBody,
    });
    const status = coreRes.status;
    const body = (await coreRes.json().catch(() => ({}))) as Record<string, unknown>;
    const coreKeys = Object.keys(body);
    const coreAnalysisValidationErrors = parseStringArray(body.analysis_validation_errors);
    const coreAnalysisValidationWarnings = parseStringArray(body.analysis_validation_warnings);
    console.log("[mobile/deck/analyze][debug] after core", {
      status,
      coreOk: coreRes.ok,
      keyCount: coreKeys.length,
      keys: coreKeys,
      hasAnalysis: typeof body.analysis === "string" || body.analysis != null,
      hasAnalysisJson: body.analysis_json != null,
      hasAnalysisValidationErrors: Array.isArray(body.analysis_validation_errors),
      hasValidatedAnalysisOk: Object.prototype.hasOwnProperty.call(body, "validated_analysis_ok"),
      hasValidatedAnalysisCode: Object.prototype.hasOwnProperty.call(body, "validated_analysis_code"),
      analysisValidationErrorCount: coreAnalysisValidationErrors.length,
      analysisValidationErrorSample: coreAnalysisValidationErrors[0]?.slice(0, 200),
      analysisValidationWarningCount: coreAnalysisValidationWarnings.length,
    });

    if (!coreRes.ok) {
      const code = pickTrimmedString(body.code) ?? `HTTP_${status}`;
      const message =
        pickTrimmedString(body.error) ??
        pickTrimmedString(body.message) ??
        `Analyze returned ${status}.`;
      return NextResponse.json(
        {
          ok: false,
          partial: false,
          code,
          message,
        },
        { status }
      );
    }

    const score = typeof body.score === "number" ? body.score : null;
    const suggestions = Array.isArray(body.suggestions)
      ? (body.suggestions as Array<{ card?: string; reason?: string }>)
      : [];
    const whatsGood = parseStringArray(body.whatsGood);
    const quickFixes = parseStringArray(body.quickFixes);
    const issues = parseStringArray(body.issues);
    const fixes = parseStringArray(body.fixes);
    const priority = parseStringArray(body.priority);
    const validationErrors = parseStringArray(body.analysis_validation_errors);
    const validationWarnings = parseStringArray(body.analysis_validation_warnings);
    const counts = parseCounts(body.counts);
    const bands = parseBands(body.bands);
    const curveBuckets = parseCurveBuckets(body.curveBuckets);
    const filteredSummary = pickTrimmedString(body.filteredSummary);
    const filteredReasons = parseStringArray(body.filteredReasons);
    const filteredCount = parseFiniteNumber(body.filteredCount);
    const promptVersion =
      pickTrimmedString(body.prompt_version) ??
      pickTrimmedString(body.prompt_version_id);

    const responseCommander =
      requestCommander ?? pickTrimmedString(body.commander) ?? null;
    const responseFormat =
      requestFormat ?? pickTrimmedString(body.format) ?? "Commander";

    let analysis = null as Awaited<
      ReturnType<typeof generateAppSafeDeckExplanation>
    > | null;
    let partial = false;
    let code: string | null = null;
    let message: string | null = null;
    try {
      analysis = await generateAppSafeDeckExplanation({
        score,
        whatsGood,
        quickFixes,
        suggestions,
        counts: (body.counts as Record<string, unknown> | undefined) ?? null,
        commander: responseCommander,
        format: responseFormat,
        userId: auth?.user?.id ?? null,
        isPro,
        sourcePage: requestSourcePage,
        usageSource: requestUsageSource,
      });
      console.log("[mobile/deck/analyze][debug] after explainer", {
        hasExplainerSummary: typeof analysis?.summary === "string" && analysis.summary.trim().length > 0,
        hasExplainerArchetype:
          typeof analysis?.archetype === "string" && analysis.archetype.trim().length > 0,
        hasExplainerGamePlan:
          typeof analysis?.game_plan === "string" && analysis.game_plan.trim().length > 0,
        suggestionExplanationCount: Array.isArray(analysis?.suggestion_explanations)
          ? analysis.suggestion_explanations.length
          : 0,
      });
    } catch {
      partial = true;
      code = "ANALYSIS_EXPLANATION_UNAVAILABLE";
      message = "Detailed AI explanation unavailable for this run.";
      analysis = null;
      console.log("[mobile/deck/analyze][debug] explainer threw", {
        partial,
        code,
        message,
      });
    }

    console.log("[mobile/deck/analyze]", {
      status,
      requestMode,
      ok: true,
      partial,
      code,
      validationErrorCount: validationErrors.length,
      validationErrorSample: validationErrors[0]?.slice(0, 200),
      analysisNulled: analysis === null,
    });
    console.log("[mobile/deck/analyze][debug] final response", {
      ok: true,
      partial,
      code,
      message,
      hasAnalysis: analysis !== null,
      validationErrorCount: validationErrors.length,
      validationErrorSample: validationErrors[0]?.slice(0, 200),
    });
    const proAnalysis =
      isPro
        ? buildProAnalysis({
            score,
            counts,
            bands,
            curveBuckets,
            filteredSummary,
            filteredReasons,
            filteredCount,
            validationErrors,
            validationWarnings,
            format: responseFormat,
            commander: responseCommander,
            analysis,
            suggestions,
          })
        : null;
    const responseBody = {
      ok: true,
      partial,
      code,
      message,
      score,
      issues,
      fixes,
      priority,
      whatsGood,
      quickFixes,
      suggestions,
      analysis,
      validationErrors,
      validationWarnings,
      promptVersion,
      ...(proAnalysis ? { proAnalysis } : {}),
    };
    if (cacheKey && cacheSupabase && !partial) {
      await supabaseCacheSet(cacheSupabase, "ai_private_cache", cacheKey, {
        text: JSON.stringify(responseBody),
        usage: { route: "/api/mobile/deck/analyze", cache_version: MOBILE_ANALYZE_CACHE_VERSION },
        fallback: false,
      }, MOBILE_ANALYZE_CACHE_TTL_MS).catch(() => undefined);
    }
    return NextResponse.json(responseBody, { status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected mobile analyze error";
    return NextResponse.json(
      {
        ok: false,
        code: "MOBILE_ANALYZE_INTERNAL_ERROR",
        message,
        partial: false,
        result: null,
      },
      { status: 500 }
    );
  }
}
