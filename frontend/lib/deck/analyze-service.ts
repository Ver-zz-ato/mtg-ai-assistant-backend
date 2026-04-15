import { runDeckAnalyzeCore as runDeckAnalyzeRouteCore } from "@/app/api/deck/analyze/route";

type AnalyzeJson = Record<string, unknown>;

function pickTrimmedString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export async function runDeckAnalyzeCore(req: Request): Promise<Response> {
  return runDeckAnalyzeRouteCore(req);
}

export function normalizeDeckAnalyzeForMobile(params: {
  status: number;
  ok: boolean;
  body: AnalyzeJson;
}) {
  const { status, ok, body } = params;
  const basePartial = typeof body.partial === "boolean" ? body.partial : false;
  const codeFromBody = pickTrimmedString(body.code);
  const errorFromBody = pickTrimmedString(body.error);
  const summary = pickTrimmedString(body.summary) ?? pickTrimmedString(body.message);
  const analysisText = pickTrimmedString(body.analysis);
  const analysisJson = body.analysis_json ?? null;

  const validatedAnalysisOkRaw = body.validated_analysis_ok;
  const validatedAnalysisOk =
    typeof validatedAnalysisOkRaw === "boolean"
      ? validatedAnalysisOkRaw
      : validatedAnalysisOkRaw === null
        ? null
        : undefined;
  const validatedAnalysisCode = pickTrimmedString(body.validated_analysis_code);
  const validatedAnalysisMessage = pickTrimmedString(body.validated_analysis_message);
  const validatedAnalysisErrors = parseStringArray(body.validated_analysis_errors);
  const legacyValidationErrors = parseStringArray(body.analysis_validation_errors);
  const validationWarnings = parseStringArray(body.analysis_validation_warnings);
  const legacyFailedValidationSummary =
    typeof (summary ?? analysisText) === "string" &&
    /failed validation/i.test(summary ?? analysisText ?? "");
  const shouldUseLegacyValidationFallback =
    validatedAnalysisOk === undefined || validatedAnalysisOk === null;

  const score = typeof body.score === "number" ? body.score : null;
  const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];
  const issues = parseStringArray(body.issues);
  const fixes = parseStringArray(body.fixes);
  const priority = parseStringArray(body.priority);
  const whatsGood = parseStringArray(body.whatsGood);
  const quickFixes = parseStringArray(body.quickFixes);
  const promptVersion =
    pickTrimmedString(body.prompt_version) ?? pickTrimmedString(body.prompt_version_id) ?? null;

  const normalizedValidationErrors =
    validatedAnalysisErrors.length > 0 ? validatedAnalysisErrors : legacyValidationErrors;

  if (!ok) {
    return {
      ok: false as const,
      code: codeFromBody ?? `HTTP_${status}`,
      message: errorFromBody ?? `Analyze returned ${status}.`,
      partial: false,
      score,
      suggestions,
      issues,
      fixes,
      priority,
      whatsGood,
      quickFixes,
      analysis: null,
      analysis_json: null,
      validationErrors: normalizedValidationErrors,
      validationWarnings: validationWarnings,
      promptVersion,
    };
  }

  const hasValidationFailure =
    validatedAnalysisOk === false ||
    (shouldUseLegacyValidationFallback &&
      (legacyValidationErrors.length > 0 || legacyFailedValidationSummary));

  if (hasValidationFailure) {
    return {
      ok: true as const,
      partial: true,
      code: validatedAnalysisCode ?? "ANALYSIS_VALIDATION_FAILED",
      message:
        validatedAnalysisMessage ??
        "Detailed AI analysis unavailable for this run.",
      score,
      suggestions,
      issues,
      fixes,
      priority,
      whatsGood,
      quickFixes,
      analysis: null,
      analysis_json: null,
      validationErrors: normalizedValidationErrors,
      validationWarnings: validationWarnings,
      promptVersion,
    };
  }

  const hasAnalysisPayload =
    (typeof analysisText === "string" && analysisText.trim().length > 0) || analysisJson !== null;
  if (!hasAnalysisPayload) {
    return {
      ok: true as const,
      partial: true,
      code: "ANALYSIS_UNAVAILABLE",
      message: "Detailed AI analysis unavailable for this run.",
      score,
      suggestions,
      issues,
      fixes,
      priority,
      whatsGood,
      quickFixes,
      analysis: null,
      analysis_json: null,
      validationErrors: normalizedValidationErrors,
      validationWarnings: validationWarnings,
      promptVersion,
    };
  }

  return {
    ok: true as const,
    partial: basePartial,
    code: null,
    message: null,
    score,
    suggestions,
    issues,
    fixes,
    priority,
    whatsGood,
    quickFixes,
    analysis: analysisText ?? null,
    analysis_json: analysisJson,
    validationErrors: normalizedValidationErrors,
    validationWarnings: validationWarnings,
    promptVersion,
  };
}

