import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { DECK_TRANSFORM_FREE } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { norm, aggregateCards, parseAiDeckOutputLines, getCommanderColorIdentity, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import {
  getFormatRules,
  isCommanderFormatString,
  tryDeckFormatStringToAnalyzeFormat,
} from "@/lib/deck/formatRules";
import {
  normalizeTransformBody,
  buildTransformSystemPrompt,
  buildTransformUserPrompt,
} from "@/lib/deck/generation-input";
import { summarizeTransformIntent } from "@/lib/deck/transform-intent";
import { warnSourceOffColor } from "@/lib/deck/transform-warnings";
import { buildGenerationPreviewFacts } from "@/lib/deck/generation-preview-facts";
import { precheckFixLegalitySourceDeck } from "@/lib/deck/transform-legality-check";
import { enforceTransformRules } from "@/lib/deck/transform-enforcement";
import { getCachedPrices } from "@/lib/ai/price-utils";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const runtime = "nodejs";

type QtyRow = { name: string; qty: number };
type ChangeReasonMaps = {
  added?: Record<string, string>;
  removed?: Record<string, string>;
};

type WhyPayload = {
  overallWhy: string;
  changeReasons?: ChangeReasonMaps | null;
};

function looksLikeLandName(name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  return /\b(plains|island|swamp|mountain|forest)\b/.test(lowerName)
    || /triome|catacomb|sanctuary|fetch|passage|tower|garden|grave|marsh|coast|vista|pathway|citadel|palace|quarters|headquarters|ruins|mesa|delta|strand|heath|foothills|foundry|crypt|harbor|sanctum|temple|panorama|orchard|citadel|vantage|canyon|garrison|sanctuary/.test(lowerName);
}

function looksLikeManaSupportCard(name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  if (looksLikeLandName(name)) return true;
  return /signet|talisman|sol ring|arcane signet|fellwar stone|mind stone|coldsteel heart|commander's sphere|chromatic lantern|wayfarer's bauble|thought vessel|coalition relic|cultivate|kodama's reach|nature's lore|three visits|farseek|rampant growth|sakura-tribe elder|harrow|birds of paradise|llanowar elves|elvish mystic|arbor elf|utopia sprawl|wild growth|skyshroud claim|migration path|circuitous route|astral cornucopia/.test(lowerName);
}

function mergeReasonMaps(
  base: ChangeReasonMaps | null | undefined,
  next: ChangeReasonMaps | null | undefined
): ChangeReasonMaps | null {
  const added = { ...(base?.added ?? {}), ...(next?.added ?? {}) };
  const removed = { ...(base?.removed ?? {}), ...(next?.removed ?? {}) };
  if (!Object.keys(added).length && !Object.keys(removed).length) return null;
  return {
    ...(Object.keys(added).length ? { added } : {}),
    ...(Object.keys(removed).length ? { removed } : {}),
  };
}

function rowMap(rows: QtyRow[]): Map<string, { name: string; qty: number }> {
  const out = new Map<string, { name: string; qty: number }>();
  for (const row of rows) {
    const key = norm(row.name);
    const existing = out.get(key);
    if (existing) existing.qty += row.qty;
    else out.set(key, { name: row.name, qty: row.qty });
  }
  return out;
}

function diffRows(beforeRows: QtyRow[], afterRows: QtyRow[]) {
  const before = rowMap(beforeRows);
  const after = rowMap(afterRows);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const added: QtyRow[] = [];
  const removed: QtyRow[] = [];
  for (const key of keys) {
    const beforeQty = before.get(key)?.qty ?? 0;
    const afterQty = after.get(key)?.qty ?? 0;
    const name = after.get(key)?.name ?? before.get(key)?.name ?? key;
    if (afterQty > beforeQty) added.push({ name, qty: afterQty - beforeQty });
    if (beforeQty > afterQty) removed.push({ name, qty: beforeQty - afterQty });
  }
  added.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  removed.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  return { added, removed };
}

function normalizeRows(rows: QtyRow[]): QtyRow[] {
  return rows
    .filter((row) => row.qty > 0 && row.name.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}

function enforceManaBasePassScope(args: {
  sourceRows: QtyRow[];
  resultRows: QtyRow[];
  targetCount: number;
}): QtyRow[] {
  const working = rowMap(args.resultRows);
  const source = rowMap(args.sourceRows);
  const diff = diffRows(args.sourceRows, args.resultRows);

  const nonManaAdds = diff.added.filter((row) => !looksLikeManaSupportCard(row.name));
  for (const row of nonManaAdds) {
    const key = norm(row.name);
    const current = working.get(key);
    if (!current) continue;
    const nextQty = current.qty - row.qty;
    if (nextQty > 0) working.set(key, { ...current, qty: nextQty });
    else working.delete(key);
  }

  let total = Array.from(working.values()).reduce((sum, row) => sum + row.qty, 0);
  if (total < args.targetCount) {
    const candidateRestores = diff.removed.filter((row) => looksLikeLandName(row.name));
    for (const row of candidateRestores) {
      if (total >= args.targetCount) break;
      const key = norm(row.name);
      const sourceRow = source.get(key);
      if (!sourceRow) continue;
      const currentQty = working.get(key)?.qty ?? 0;
      const maxRestore = sourceRow.qty - currentQty;
      if (maxRestore <= 0) continue;
      const needed = Math.min(args.targetCount - total, maxRestore);
      working.set(key, { name: sourceRow.name, qty: currentQty + needed });
      total += needed;
    }
  }

  return normalizeRows(Array.from(working.values()));
}

function totalLandQty(rows: QtyRow[]): number {
  return rows.reduce((sum, row) => sum + (looksLikeLandName(row.name) ? row.qty : 0), 0);
}

function decrementWorkingQty(working: Map<string, { name: string; qty: number }>, name: string, qty: number): number {
  const key = norm(name);
  const current = working.get(key);
  if (!current || qty <= 0) return 0;
  const nextQty = Math.max(0, current.qty - qty);
  const removed = current.qty - nextQty;
  if (nextQty > 0) working.set(key, { ...current, qty: nextQty });
  else working.delete(key);
  return removed;
}

function incrementWorkingQty(working: Map<string, { name: string; qty: number }>, name: string, qty: number): number {
  if (qty <= 0) return 0;
  const key = norm(name);
  const currentQty = working.get(key)?.qty ?? 0;
  working.set(key, { name, qty: currentQty + qty });
  return qty;
}

function enforceConstructedGeneralCleanupScope(args: {
  sourceRows: QtyRow[];
  resultRows: QtyRow[];
  targetCount: number;
}): QtyRow[] {
  const maxLandReduction = 2;
  const working = rowMap(args.resultRows);
  const source = rowMap(args.sourceRows);
  const diff = diffRows(args.sourceRows, args.resultRows);
  const sourceLandQty = totalLandQty(args.sourceRows);

  const addedLandQueue = diff.added
    .filter((row) => looksLikeLandName(row.name))
    .flatMap((row) => Array.from({ length: row.qty }, () => row.name));
  const addedNonLandQueue = diff.added
    .filter((row) => !looksLikeLandName(row.name))
    .flatMap((row) => Array.from({ length: row.qty }, () => row.name));
  const removedLandQueue = diff.removed
    .filter((row) => looksLikeLandName(row.name))
    .flatMap((row) => Array.from({ length: row.qty }, () => row.name));
  const removedAnyQueue = diff.removed.flatMap((row) => Array.from({ length: row.qty }, () => row.name));

  let total = Array.from(working.values()).reduce((sum, row) => sum + row.qty, 0);
  let currentLandQty = totalLandQty(Array.from(working.values()));

  while (sourceLandQty - currentLandQty > maxLandReduction && removedLandQueue.length) {
    const restoreLand = removedLandQueue.shift();
    if (!restoreLand) break;
    incrementWorkingQty(working, restoreLand, 1);
    currentLandQty += 1;
    total += 1;

    const addedToTrim = addedLandQueue.shift() ?? addedNonLandQueue.shift();
    if (addedToTrim) {
      const removedQty = decrementWorkingQty(working, addedToTrim, 1);
      if (removedQty > 0) {
        if (looksLikeLandName(addedToTrim)) currentLandQty -= removedQty;
        total -= removedQty;
      }
    }
  }

  while (total < args.targetCount && removedAnyQueue.length) {
    const candidate = removedAnyQueue.shift();
    if (!candidate) break;
    const sourceRow = source.get(norm(candidate));
    if (!sourceRow) continue;
    const currentQty = working.get(norm(candidate))?.qty ?? 0;
    if (currentQty >= sourceRow.qty) continue;
    incrementWorkingQty(working, sourceRow.name, 1);
    if (looksLikeLandName(sourceRow.name)) currentLandQty += 1;
    total += 1;
  }

  while (total > args.targetCount) {
    const addedToTrim = addedLandQueue.shift() ?? addedNonLandQueue.shift();
    if (!addedToTrim) break;
    const removedQty = decrementWorkingQty(working, addedToTrim, 1);
    if (removedQty > 0) {
      if (looksLikeLandName(addedToTrim)) currentLandQty -= removedQty;
      total -= removedQty;
    }
  }

  return normalizeRows(Array.from(working.values()));
}

function normalizeReasonText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeReasonBucket(value: unknown): Record<string, string> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = normalizeReasonText((item as Record<string, unknown>).name);
    const reason = normalizeReasonText((item as Record<string, unknown>).reason);
    if (!name || !reason) continue;
    out[name.trim().toLowerCase()] = reason;
  }
  return Object.keys(out).length ? out : undefined;
}

function findMissingReasonRows(rows: QtyRow[], reasons: Record<string, string> | undefined): QtyRow[] {
  return rows.filter((row) => !reasons?.[row.name.trim().toLowerCase()]);
}

function buildFallbackReason(args: {
  bucket: "added" | "removed";
  row: QtyRow;
  transformIntent: string;
}): string {
  const lowerName = args.row.name.trim().toLowerCase();
  const looksLikeLand = /\b(plains|island|swamp|mountain|forest)\b/.test(lowerName) || /triome|catacomb|sanctuary|fetch|passage|tower|garden|grave|marsh|coast|vista|pathway|citadel|palace|quarters|headquarters|ruins/.test(lowerName);
  const pass = args.transformIntent;
  if (pass === "improve_mana_base") {
    return args.bucket === "added"
      ? looksLikeLand
        ? "Added to improve mana consistency and color access."
        : "Added to support smoother ramp and mana development."
      : looksLikeLand
        ? "Removed to make room for cleaner fixing."
        : "Removed to free space for better mana support.";
  }
  if (pass === "tighten_curve") {
    return args.bucket === "added"
      ? "Added to make the early game smoother and more efficient."
      : "Removed to cut clunk from the curve.";
  }
  if (pass === "add_interaction") {
    return args.bucket === "added"
      ? "Added to give the deck a cleaner answer package."
      : "Removed to make room for more useful interaction.";
  }
  if (pass === "lower_budget") {
    return args.bucket === "added"
      ? "Added as a cheaper fit for the same overall plan."
      : "Removed to lower the deck's overall cost.";
  }
  if (pass === "more_casual") {
    return args.bucket === "added"
      ? "Added to keep the deck's play pattern a little softer and more table-friendly."
      : "Removed to dial back sharper or swingier play patterns.";
  }
  if (pass === "more_optimized") {
    return args.bucket === "added"
      ? "Added to push consistency and stronger lines of play."
      : "Removed because it was weaker than the upgraded line for this pass.";
  }
  if (pass === "fix_legality") {
    return args.bucket === "added"
      ? "Added as part of the legality repair output."
      : "Removed because it did not meet the format's legality rules.";
  }
  return args.bucket === "added"
    ? "Added to better match the requested refinement goal."
    : "Removed to make room for the requested refinement goal.";
}

function buildDeterministicLegalityWhy(args: {
  analyzeFormat: string;
  summary: string;
  warnings: string[];
  removedReasons: Array<{ name: string; reason: string }>;
  added: QtyRow[];
  removed: QtyRow[];
  alreadyLegal?: boolean;
  needsDeckSizeOnlyReview?: boolean;
}): WhyPayload {
  if (args.alreadyLegal) {
    return {
      overallWhy: `No swaps were suggested because this deck already passes current ${args.analyzeFormat} legality, ban-list, and copy-count checks.`,
      changeReasons: null,
    };
  }
  if (args.needsDeckSizeOnlyReview) {
    return {
      overallWhy: `This pass did not suggest filler cards. The list is legal for ${args.analyzeFormat}, but its deck size still needs manual review before you save it.`,
      changeReasons: null,
    };
  }
  const removedMap: Record<string, string> = {};
  for (const item of args.removedReasons) {
    removedMap[item.name.trim().toLowerCase()] ??= item.reason;
  }
  const overallWhy = args.removed.length
    ? `This legality pass only touched cards that broke ${args.analyzeFormat} rules. It removed illegal, off-color, or extra-copy cards and did not invent optimization swaps.`
    : `This legality pass focused only on rules compliance for ${args.analyzeFormat}.`;
  return {
    overallWhy,
    changeReasons: {
      ...(args.added.length ? { added: Object.create(null) as Record<string, string> } : {}),
      ...(Object.keys(removedMap).length ? { removed: removedMap } : {}),
    },
  };
}

async function fetchOpenAIContent(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  max_completion_tokens: number;
  response_format?: Record<string, unknown>;
}) {
  const payload = prepareOpenAIBody({
    model: args.model,
    messages: args.messages,
    max_completion_tokens: args.max_completion_tokens,
    ...(args.response_format ? { response_format: args.response_format } : {}),
  } as Record<string, unknown>);

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return String(data?.choices?.[0]?.message?.content ?? "");
}

async function buildAiWorkshopWhy(args: {
  apiKey: string;
  model: string;
  format: string;
  commanderName: string | null;
  transformIntent: string;
  powerLevel: string;
  budget: string;
  sourceRows: QtyRow[];
  resultRows: QtyRow[];
  summary: string;
  warnings: string[];
}): Promise<WhyPayload | null> {
  const diff = diffRows(args.sourceRows, args.resultRows);
  if (!diff.added.length && !diff.removed.length) {
    return {
      overallWhy: `No swaps were suggested. This pass kept the working draft as-is because the current list already matched the requested direction closely enough.`,
      changeReasons: null,
    };
  }

  const fullPrompt = [
    "Explain these already-decided deck changes for ManaTap AI Workshop.",
    "Return JSON only with shape:",
    '{"overallWhy":"short paragraph","added":[{"name":"Card","reason":"reason"}],"removed":[{"name":"Card","reason":"reason"}]}',
    "Rules:",
    "- Mention cards with [[Card Name]] markup when you reference them in reasons or overallWhy.",
    "- Explain only the provided swaps. Do not invent extra cards or new changes.",
    "- Keep each per-card reason to one short sentence.",
    "- Keep overallWhy to 2-4 concise sentences focused on the pass goal.",
    "- Every added row must appear once in the added array, even if the reason is brief.",
    "- Every removed row must appear once in the removed array, even if the reason is brief.",
    "- If the pass changed many cards, keep each reason compact rather than skipping rows.",
    `Format: ${args.format}`,
    `Commander: ${args.commanderName ?? "none"}`,
    `Transform intent: ${args.transformIntent}`,
    `Power level: ${args.powerLevel}`,
    `Budget: ${args.budget}`,
    `Summary: ${args.summary}`,
    args.warnings.length ? `Validation notes: ${args.warnings.join(" | ")}` : "Validation notes: none",
    `Added cards: ${diff.added.map((row) => `${row.qty} ${row.name}`).join("; ") || "none"}`,
    `Removed cards: ${diff.removed.map((row) => `${row.qty} ${row.name}`).join("; ") || "none"}`,
  ].join("\n");

  async function requestWhy(userPrompt: string, maxTokens: number): Promise<WhyPayload | null> {
    const content = await fetchOpenAIContent({
      apiKey: args.apiKey,
      model: args.model,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You explain Magic: The Gathering deck edits for a premium mobile deckbuilding app. Be precise, calm, and concrete. Return strict JSON only.",
        },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const overallWhy = normalizeReasonText(parsed.overallWhy) ?? args.summary;
    const added = normalizeReasonBucket(parsed.added);
    const removed = normalizeReasonBucket(parsed.removed);
    return {
      overallWhy,
      changeReasons: added || removed ? { ...(added ? { added } : {}), ...(removed ? { removed } : {}) } : null,
    };
  }

  try {
    let payload = await requestWhy(fullPrompt, 3200);
    const missingAdded = findMissingReasonRows(diff.added, payload?.changeReasons?.added);
    const missingRemoved = findMissingReasonRows(diff.removed, payload?.changeReasons?.removed);

    if (missingAdded.length || missingRemoved.length) {
      const followupPrompt = [
        "Fill only the missing per-card reasons for this ManaTap AI Workshop pass.",
        "Return JSON only with shape:",
        '{"overallWhy":"","added":[{"name":"Card","reason":"reason"}],"removed":[{"name":"Card","reason":"reason"}]}',
        "Rules:",
        "- Leave overallWhy as an empty string.",
        "- Only include rows listed below.",
        "- One short sentence per row.",
        "- Mention cards with [[Card Name]] markup if you cite another card in the explanation.",
        `Format: ${args.format}`,
        `Commander: ${args.commanderName ?? "none"}`,
        `Transform intent: ${args.transformIntent}`,
        `Power level: ${args.powerLevel}`,
        `Budget: ${args.budget}`,
        `Summary: ${args.summary}`,
        args.warnings.length ? `Validation notes: ${args.warnings.join(" | ")}` : "Validation notes: none",
        `Missing added rows: ${missingAdded.map((row) => `${row.qty} ${row.name}`).join("; ") || "none"}`,
        `Missing removed rows: ${missingRemoved.map((row) => `${row.qty} ${row.name}`).join("; ") || "none"}`,
      ].join("\n");

      const topUp = await requestWhy(followupPrompt, 2200).catch(() => null);
      payload = {
        overallWhy: payload?.overallWhy ?? args.summary,
        changeReasons: mergeReasonMaps(payload?.changeReasons, topUp?.changeReasons),
      };
    }

    const completedReasons = mergeReasonMaps(payload?.changeReasons, {
      added: Object.fromEntries(
        diff.added
          .filter((row) => !payload?.changeReasons?.added?.[row.name.trim().toLowerCase()])
          .map((row) => [row.name.trim().toLowerCase(), buildFallbackReason({ bucket: "added", row, transformIntent: args.transformIntent })])
      ),
      removed: Object.fromEntries(
        diff.removed
          .filter((row) => !payload?.changeReasons?.removed?.[row.name.trim().toLowerCase()])
          .map((row) => [row.name.trim().toLowerCase(), buildFallbackReason({ bucket: "removed", row, transformIntent: args.transformIntent })])
      ),
    });

    return {
      overallWhy: payload?.overallWhy ?? args.summary,
      changeReasons: completedReasons,
    };
  } catch (error) {
    console.warn("[deck/transform] explanation generation failed:", error);
    return {
      overallWhy: args.summary,
      changeReasons: null,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    const { data: userResp } = await supabase.auth.getUser();
    let user = userResp?.user;

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = normalizeTransformBody(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const input = parsed.input;
    const analyzeFormat = tryDeckFormatStringToAnalyzeFormat(input.format);
    if (!analyzeFormat) {
      return NextResponse.json(
        { ok: false, error: "Unsupported format. Use Commander, Modern, Pioneer, Standard, or Pauper." },
        { status: 400 }
      );
    }
    const rules = getFormatRules(analyzeFormat);
    const isCommander = isCommanderFormatString(analyzeFormat);

    if (input.transformIntent === "fix_legality") {
      const precheck = await precheckFixLegalitySourceDeck(input, {
        getCommanderColors: getCommanderColorIdentity,
        warnOffColor: (sourceDeckText, commander) => warnSourceOffColor(sourceDeckText, commander ?? null),
      }).catch((legErr) => {
        console.warn("[deck/transform] Source legality pre-check failed:", legErr);
        return null;
      });

      if (precheck?.alreadyLegal || precheck?.needsDeckSizeOnlyReview || precheck?.needsDeterministicRepair) {
        const deckText = precheck.validatedRows.map((c) => `${c.qty} ${c.name}`).join("\n");
        const previewFacts = await buildGenerationPreviewFacts(
          deckText,
          precheck.commanderName === "Unknown" ? null : precheck.commanderName,
          precheck.analyzeFormat as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper",
        ).catch(() => undefined);
        const sourceRows = aggregateCards(parseDeckText(input.sourceDeckText));
        const diff = diffRows(sourceRows, precheck.validatedRows);
        const whyPayload = buildDeterministicLegalityWhy({
          analyzeFormat: precheck.analyzeFormat,
          summary: precheck.alreadyLegal
            ? `No legality changes needed. This deck already passes current ${precheck.analyzeFormat} legality and color identity checks.`
            : precheck.needsDeckSizeOnlyReview
              ? `Deck size needs review. This list passed legality checks, but it is ${precheck.validatedRows.reduce((sum, row) => sum + row.qty, 0)} cards after validation instead of the expected ${rules.mainDeckTarget}.`
              : `Legality issues repaired. Illegal, off-color, or extra-copy cards were removed to match current ${precheck.analyzeFormat} rules. Review the updated deck size before saving.`,
          warnings: precheck.warnings,
          removedReasons: precheck.removedReasons,
          added: diff.added,
          removed: diff.removed,
          alreadyLegal: precheck.alreadyLegal,
          needsDeckSizeOnlyReview: precheck.needsDeckSizeOnlyReview,
        });

        return NextResponse.json({
          ok: true,
          preview: true,
          decklist: precheck.validatedRows,
          commander: precheck.commanderName,
          colors: precheck.colors,
          deckText,
          format: precheck.analyzeFormat,
          summary: precheck.alreadyLegal
            ? `No legality changes needed. This deck already passes current ${precheck.analyzeFormat} legality and color identity checks.`
            : precheck.needsDeckSizeOnlyReview
              ? `Deck size needs review. This list passed legality checks, but it is ${precheck.validatedRows.reduce((sum, row) => sum + row.qty, 0)} cards after validation instead of the expected ${rules.mainDeckTarget}.`
              : `Legality issues repaired. Illegal, off-color, or extra-copy cards were removed to match current ${precheck.analyzeFormat} rules. Review the updated deck size before saving.`,
          why: whyPayload.overallWhy,
          changeReasons: whyPayload.changeReasons,
          warnings: precheck.warnings.length ? precheck.warnings : undefined,
          transformIntent: input.transformIntent,
          ...(previewFacts ? { previewFacts } : {}),
        });
      }
    }

    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {}
    const keyHash = `user:${user.id}`;
    if (!isPro) {
      try {
        const durableLimit = await checkDurableRateLimit(
          supabase,
          keyHash,
          "/api/deck/transform",
          DECK_TRANSFORM_FREE,
          1
        );
        if (!durableLimit.allowed) {
          return NextResponse.json(
            {
              ok: false,
              code: "RATE_LIMIT_DAILY",
              error: `You've used your ${DECK_TRANSFORM_FREE} free AI Workshop refinements today. Upgrade to Pro for unlimited passes.`,
              resetAt: durableLimit.resetAt,
              remaining: 0,
            },
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        console.error("[deck/transform] Rate limit check failed:", e);
      }
    }

    const systemPrompt = buildTransformSystemPrompt(input.format);
    const userPrompt = buildTransformUserPrompt(input);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 500 });
    }

    const tierModel = getModelForTier({
      isGuest: false,
      userId: user.id,
      isPro,
      useCase: "deck_analysis",
    }).model;
    const model =
      process.env.MODEL_AI_WORKSHOP ||
      process.env.MODEL_PRO_DECK ||
      process.env.MODEL_DECK_ANALYSIS_PRO ||
      tierModel;

    let content = "";
    try {
      content = await fetchOpenAIContent({
        apiKey,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 8000,
      });
    } catch (error) {
      console.error("[deck/transform] OpenAI error:", error);
      return NextResponse.json(
        { ok: false, error: "Deck transform failed" },
        { status: 500 }
      );
    }
    const parsedLines = parseAiDeckOutputLines(content);
    let cards = aggregateCards(parsedLines);

    if (cards.length < 30 && totalDeckQty(cards) < 30) {
      return NextResponse.json(
        { ok: false, error: "Transformed decklist too short; please try again" },
        { status: 500 }
      );
    }

    const commanderName = isCommander ? input.commander || cards[0]?.name || "Unknown" : null;
    const allowedColors = isCommander && commanderName
      ? (await getCommanderColorIdentity(commanderName)).map((c) => c.toUpperCase())
      : [];
    const allNames = cards.map((c) => c.name);
    const details = await getDetailsForNamesCached(allNames);

    const warnings: string[] = [];
    if (isCommander) {
      const warnSrc = await warnSourceOffColor(input.sourceDeckText, input.commander);
      if (warnSrc) warnings.push(warnSrc);
    }

    if (isCommander) {
      const beforeCi = cards.length;
      const filtered = cards.filter((c) => {
        const entry = details.get(norm(c.name));
        if (!entry) return true;
        return isWithinColorIdentity(entry as SfCard, allowedColors);
      });
      const droppedCi = beforeCi - filtered.length;
      if (droppedCi > 0) {
        warnings.push(
          `Color identity validation removed ${droppedCi} card line(s) from the model output (off-color or unknown).`
        );
      }
      const filteredQty = totalDeckQty(filtered);
      if (filteredQty > rules.mainDeckTarget) {
        warnings.push(`Model output had ${filteredQty} cards after color filter; list trimmed to ${rules.mainDeckTarget}.`);
        cards = trimDeckToMaxQty(filtered, rules.mainDeckTarget);
      } else {
        cards = filtered;
      }
    }

    try {
      const { filterDecklistQtyRowsForFormat } = await import("@/lib/deck/recommendation-legality");
      const { lines: legalLines, removed } = await filterDecklistQtyRowsForFormat(cards, analyzeFormat, {
        logPrefix: "/api/deck/transform",
      });
      if (removed.length > 0) {
        warnings.push(
          `Legality filter removed ${removed.length} card line(s) not legal in ${analyzeFormat}.`
        );
      }
      cards = legalLines;
    } catch (legErr) {
      console.warn("[deck/transform] Legality filter failed:", legErr);
    }

    const sourceRows = aggregateCards(parseDeckText(input.sourceDeckText));

    if (input.transformIntent === "improve_mana_base") {
      const scopedCards = enforceManaBasePassScope({
        sourceRows,
        resultRows: cards,
        targetCount: rules.mainDeckTarget,
      });
      const scopedDiff = diffRows(cards, scopedCards);
      if (scopedDiff.removed.length) {
        warnings.push("Mana base pass removed non-mana additions that fell outside the pass scope.");
      }
      cards = scopedCards;
    }

    if (!isCommander && input.transformIntent === "general") {
      const scopedCards = enforceConstructedGeneralCleanupScope({
        sourceRows,
        resultRows: cards,
        targetCount: rules.mainDeckTarget,
      });
      const scopedDiff = diffRows(cards, scopedCards);
      if (scopedDiff.added.length || scopedDiff.removed.length) {
        warnings.push("General cleanup restored land count stability for this constructed deck.");
      }
      cards = scopedCards;
    }

    let priceByName: Map<string, number> | undefined;
    try {
      const priceRecord = await getCachedPrices([
        ...new Set([...sourceRows.map((row) => row.name), ...cards.map((row) => row.name)]),
      ]);
      priceByName = new Map(
        Object.entries(priceRecord)
          .filter(([, value]) => typeof value?.usd === "number" && Number.isFinite(value.usd))
          .map(([name, value]) => [name, Number(value.usd)]),
      );
    } catch {
      priceByName = undefined;
    }

    const enforced = enforceTransformRules({
      sourceRows,
      resultRows: cards,
      targetCount: rules.mainDeckTarget,
      rules: input.transformRules,
      isCommander,
      commanderName,
      transformIntent: input.transformIntent,
      budget: input.budget,
      priceByName,
    });
    if (enforced.warnings.length) warnings.push(...enforced.warnings);
    cards = enforced.rows;

    const finalQty = totalDeckQty(cards);
    if (finalQty > rules.mainDeckTarget) {
      warnings.push(`List has ${finalQty} cards after validation; trimmed to ${rules.mainDeckTarget} for ${analyzeFormat}.`);
      cards = trimDeckToMaxQty(cards, rules.mainDeckTarget);
    }
    const normalizedFinalQty = totalDeckQty(cards);
    if (normalizedFinalQty < rules.mainDeckTarget) {
      warnings.push(`List has ${normalizedFinalQty} cards after validation; target is ${rules.mainDeckTarget} for ${analyzeFormat}.`);
    }

    const deckText = cards.map((c) => `${c.qty} ${c.name}`).join("\n");
    const colors = allowedColors;

    let previewFacts: Awaited<ReturnType<typeof buildGenerationPreviewFacts>> = undefined;
    try {
      previewFacts = await buildGenerationPreviewFacts(
        deckText,
        commanderName === "Unknown" ? null : commanderName,
        analyzeFormat,
      );
    } catch {
      // optional
    }

    const intentLabel = summarizeTransformIntent(input.transformIntent);
    let summary = `Transformed: ${intentLabel}. Power ${input.powerLevel}, budget ${input.budget}.`;
    if (previewFacts?.avg_cmc != null && previewFacts.avg_cmc > 0) {
      summary += ` Avg CMC ~${previewFacts.avg_cmc}.`;
    }
    const whyPayload = await buildAiWorkshopWhy({
      apiKey,
      model,
      format: analyzeFormat,
      commanderName: commanderName === "Unknown" ? null : commanderName,
      transformIntent: input.transformIntent,
      powerLevel: input.powerLevel,
      budget: input.budget,
      sourceRows,
      resultRows: cards,
      summary,
      warnings,
    });

    return NextResponse.json({
      ok: true,
      preview: true,
      decklist: cards,
      commander: commanderName,
      colors,
      deckText,
      format: analyzeFormat,
      summary,
      plan: whyPayload?.overallWhy,
      why: whyPayload?.overallWhy,
      changeReasons: whyPayload?.changeReasons,
      warnings: warnings.length ? warnings : undefined,
      transformIntent: input.transformIntent,
      ...(previewFacts ? { previewFacts } : {}),
    });
  } catch (e: unknown) {
    console.error("[deck/transform]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
