/**
 * Shared helpers for scanner AI routes (vision + text disambiguation).
 */

import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAutoAddScannerRecognition,
  inferScannerEvidence,
  normalizeScannerText,
  scannerConfidenceScore,
  type ScannerConfidence,
  type ScannerContextPayload,
  type ScannerEvidence,
} from "@/lib/scanner/recognition";

export type FuzzyValidateResult = { validated: string; alternatives: string[]; source?: string };

export type ParsedScanAiJson = {
  primary: string;
  alternatives: string[];
  confidence: ScannerConfidence;
  reason: string;
};

export type ScanAssistMode = "fallback" | "improve";

export type ScanImageRole = "title" | "full";

export function normScannerName(s: string): string {
  return normalizeScannerText(s);
}

export function parseScanAiJsonResponse(text: string): ParsedScanAiJson | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const j = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const primary = String(j?.primary ?? j?.name ?? j?.card_name ?? j?.card ?? "").trim();
    const alternatives = Array.isArray(j?.alternatives)
      ? (j.alternatives as string[]).slice(0, 3).filter((s) => typeof s === "string" && s.trim())
      : [];
    const conf = String(j?.confidence ?? "low").toLowerCase();
    const confidence = (["high", "medium", "low"].includes(conf) ? conf : "low") as ScannerConfidence;
    const reason = String(j?.reason ?? "").trim() || "AI recognition";
    return { primary, alternatives, confidence, reason };
  } catch {
    return null;
  }
}

export async function fuzzyValidateCardName(
  guessed: string,
  supabase: SupabaseClient,
  origin?: string
): Promise<FuzzyValidateResult> {
  const q0 = cleanCardName(guessed);
  if (!q0 || q0.length < 2) return { validated: "", alternatives: [] };
  const qn = normScannerName(q0);

  try {
    const { data: exact } = await supabase.from("scryfall_cache").select("name").ilike("name", q0).limit(1);
    if (exact?.length) return { validated: exact[0].name, alternatives: [], source: "cache_exact" };

    const escaped = q0.replace(/[%_]/g, "\\$&");
    const { data: contains } = await supabase
      .from("scryfall_cache")
      .select("name")
      .ilike("name", `%${escaped}%`)
      .limit(5);
    if (contains?.length) {
      const sorted = contains
        .map((r) => ({ name: r.name, score: stringSimilarity(qn, normScannerName(r.name)) }))
        .sort((a, b) => b.score - a.score);
      return {
        validated: sorted[0].name,
        alternatives: sorted.slice(1, 4).map((r) => r.name),
        source: "cache_contains",
      };
    }

    if (origin) {
      try {
        const fr = await fetch(`${origin}/api/cards/fuzzy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [q0] }),
        });
        const j = (await fr.json().catch(() => ({}))) as {
          ok?: boolean;
          results?: Record<string, { suggestion?: string; all?: string[]; matches?: Array<{ name: string }> }>;
        };
        if (j?.ok && j.results) {
          const entry = j.results[q0];
          const matches = entry?.matches;
          if (Array.isArray(matches) && matches.length > 0) {
            const sug = String(matches[0].name ?? "").trim();
            const rest = matches
              .slice(1, 4)
              .map((m) => String(m.name ?? "").trim())
              .filter(Boolean);
            if (sug) return { validated: sug, alternatives: rest, source: "fuzzy_api_matches" };
          }
          const sug = entry?.suggestion?.trim();
          const all = Array.isArray(entry?.all)
            ? entry.all.map((s) => String(s).trim()).filter(Boolean)
            : [];
          if (sug) {
            const alts = all.filter((n) => normScannerName(n) !== normScannerName(sug)).slice(0, 3);
            return { validated: sug, alternatives: alts, source: "fuzzy_api_legacy" };
          }
        }
      } catch {
        /* fall through */
      }
    }

    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`, {
      cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as { name?: string };
    if (j?.name) return { validated: String(j.name).trim(), alternatives: [], source: "scryfall_named_fuzzy" };
  } catch {
    /* fall through */
  }
  return { validated: "", alternatives: [] };
}

export function adjustScanAiConfidence(
  model: ScannerConfidence,
  triggerReason: string | undefined,
  validatedName: string,
  topFuzzyNameFromClient: string | undefined
): ScannerConfidence {
  if (model === "low") return "low";
  if (topFuzzyNameFromClient && validatedName && normScannerName(validatedName) === normScannerName(topFuzzyNameFromClient)) {
    return model;
  }
  const downrank = ["ambiguous_scores", "low_top_score", "short_text", "zero_matches", "no_text"];
  if (triggerReason && downrank.includes(triggerReason) && model === "high") {
    return "medium";
  }
  return model;
}

export function rankScanAlternativesDeduped(primaryValidated: string, extras: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (n: string) => {
    const t = n.trim();
    if (!t) return;
    const k = normScannerName(t);
    if (seen.has(k)) return;
    if (normScannerName(t) === normScannerName(primaryValidated)) return;
    seen.add(k);
    out.push(t);
  };
  for (const e of extras) add(e);
  return out.slice(0, max);
}

export type BuiltScanRecognition = {
  source: "ai_vision" | "ai_text";
  assist_mode: ScanAssistMode;
  guessed_name: string;
  validated_name: string;
  confidence: ScannerConfidence;
  confidence_score: number;
  reason: string;
  alternatives: string[];
  validation_source: string;
  evidence: ScannerEvidence;
  requires_confirmation: boolean;
  can_auto_add: boolean;
  ai_trigger_reason?: string;
  top_fuzzy_name_before?: string;
  image_role?: ScanImageRole;
  scan_session_id?: string | null;
  scan_attempt_id?: string | null;
  source_screen?: string | null;
};

/** When the model returns a near-miss, snap to a client fuzzy candidate before validation. */
export function snapParsedPrimaryToFuzzyCandidates(
  parsed: ParsedScanAiJson,
  fuzzyMatches: Array<{ name: string; score?: number }>
): ParsedScanAiJson {
  if (!parsed.primary.trim() || !fuzzyMatches.length) return parsed;
  const pk = normScannerName(parsed.primary);
  for (const m of fuzzyMatches) {
    if (normScannerName(m.name) === pk) return parsed;
  }
  let bestName = fuzzyMatches[0].name;
  let bestSim = stringSimilarity(pk, normScannerName(bestName));
  for (const m of fuzzyMatches.slice(1)) {
    const sim = stringSimilarity(pk, normScannerName(m.name));
    if (sim > bestSim) {
      bestSim = sim;
      bestName = m.name;
    }
  }
  if (bestSim >= 0.72) {
    return {
      ...parsed,
      primary: bestName,
      reason: parsed.reason || "Snapped to nearest fuzzy candidate.",
    };
  }
  return parsed;
}

/** Last resort for Phase A when AI output cannot be validated — try client fuzzy list in order. */
export async function buildDisambiguateFuzzyFallbackRecognition(params: {
  fuzzyMatches: Array<{ name: string; score?: number }>;
  supabase: SupabaseClient;
  origin: string;
  scanContext: ScannerContextPayload | null;
  topFuzzyNameFromClient?: string;
  scanSessionId?: string | null;
  scanAttemptId?: string | null;
  sourceScreen?: string | null;
}): Promise<BuiltScanRecognition | null> {
  const ordered = [...params.fuzzyMatches].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );
  for (const row of ordered) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const alts = ordered
      .map((m) => m.name)
      .filter((n) => normScannerName(n) !== normScannerName(name))
      .slice(0, 2);
    const recognition = await buildValidatedScanRecognition({
      parsed: {
        primary: name,
        alternatives: alts,
        confidence: "medium",
        reason: "Fuzzy fallback after disambiguation could not validate the AI pick.",
      },
      supabase: params.supabase,
      origin: params.origin,
      scanContext: params.scanContext,
      topFuzzyNameFromClient: params.topFuzzyNameFromClient ?? name,
      source: "ai_text",
      assistMode: "fallback",
      scanSessionId: params.scanSessionId,
      scanAttemptId: params.scanAttemptId,
      sourceScreen: params.sourceScreen,
    });
    if (recognition) return recognition;
  }
  return null;
}

export async function buildValidatedScanRecognition(params: {
  parsed: ParsedScanAiJson;
  supabase: SupabaseClient;
  origin: string;
  scanContext: ScannerContextPayload | null;
  topFuzzyNameFromClient?: string;
  source: BuiltScanRecognition["source"];
  assistMode: ScanAssistMode;
  imageRole?: ScanImageRole;
  scanSessionId?: string | null;
  scanAttemptId?: string | null;
  sourceScreen?: string | null;
}): Promise<BuiltScanRecognition | null> {
  const { parsed, supabase, origin, scanContext } = params;
  if (!parsed.primary) return null;

  const primaryRes = await fuzzyValidateCardName(parsed.primary, supabase, origin);
  const altResults = await Promise.all(
    parsed.alternatives.slice(0, 3).map((a) => fuzzyValidateCardName(a, supabase, origin))
  );

  const allValidated: string[] = [];
  if (primaryRes.validated) allValidated.push(primaryRes.validated);
  for (const p of altResults) {
    if (p.validated && !allValidated.some((n) => normScannerName(n) === normScannerName(p.validated))) {
      allValidated.push(p.validated);
    }
  }

  const bestValidated = primaryRes.validated || allValidated[0];
  if (!bestValidated) return null;

  const extraFromAlts = altResults
    .flatMap((r) => (r.validated ? [r.validated] : []))
    .filter((n) => normScannerName(n) !== normScannerName(bestValidated));
  const mergedAlts = rankScanAlternativesDeduped(
    bestValidated,
    [...primaryRes.alternatives, ...extraFromAlts, ...allValidated.slice(1)],
    5
  );

  const finalConfidence = adjustScanAiConfidence(
    parsed.confidence,
    scanContext?.aiTriggerReason,
    bestValidated,
    params.topFuzzyNameFromClient
  );

  const validationSource = primaryRes.source ?? "unknown";
  const canAutoAdd = canAutoAddScannerRecognition({
    confidence: finalConfidence,
    validationSource,
    ctx: scanContext,
    validatedName: bestValidated,
  });
  const evidence = inferScannerEvidence({
    parsedReason: parsed.reason,
    ctx: scanContext,
    validatedName: bestValidated,
    validationSource,
  });

  return {
    source: params.source,
    assist_mode: params.assistMode,
    guessed_name: parsed.primary,
    validated_name: bestValidated,
    confidence: finalConfidence,
    confidence_score: scannerConfidenceScore(finalConfidence),
    reason: parsed.reason,
    alternatives: mergedAlts,
    validation_source: validationSource,
    evidence,
    requires_confirmation: !canAutoAdd,
    can_auto_add: canAutoAdd,
    ai_trigger_reason: scanContext?.aiTriggerReason,
    top_fuzzy_name_before: params.topFuzzyNameFromClient,
    image_role: params.imageRole,
    scan_session_id: params.scanSessionId,
    scan_attempt_id: params.scanAttemptId,
    source_screen: params.sourceScreen,
  };
}
