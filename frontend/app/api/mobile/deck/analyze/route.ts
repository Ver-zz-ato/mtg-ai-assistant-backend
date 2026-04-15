import { NextResponse } from "next/server";
import { runDeckAnalyzeCore } from "@/app/api/deck/analyze/route";
import { generateAppSafeDeckExplanation } from "@/lib/deck/analyze-app-explainer";

export const runtime = "nodejs";

function pickTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export async function POST(req: Request) {
  try {
    let requestMode: "deckId" | "deckText" | "unknown" = "unknown";
    let requestCommander: string | null = null;
    let requestFormat: string | null = null;
    try {
      const payload = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
      const hasDeckId = typeof payload.deckId === "string" && payload.deckId.trim().length > 0;
      const hasDeckText =
        typeof payload.deckText === "string" && payload.deckText.trim().length > 0;
      requestMode = hasDeckId ? "deckId" : hasDeckText ? "deckText" : "unknown";
      requestCommander = pickTrimmedString(payload.commander);
      requestFormat = pickTrimmedString(payload.format);
    } catch {
      requestMode = "unknown";
    }
    const coreRes = await runDeckAnalyzeCore(req, {
      includeValidatedNarrative: false,
    });
    const status = coreRes.status;
    const body = (await coreRes.json().catch(() => ({}))) as Record<string, unknown>;

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
        userId: null,
        isPro: false,
      });
    } catch {
      partial = true;
      code = "ANALYSIS_EXPLANATION_UNAVAILABLE";
      message = "Detailed AI explanation unavailable for this run.";
      analysis = null;
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
    return NextResponse.json(
      {
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
      },
      { status }
    );
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

