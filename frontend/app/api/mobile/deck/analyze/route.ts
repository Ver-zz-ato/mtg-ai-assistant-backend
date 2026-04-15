import { NextResponse } from "next/server";
import {
  normalizeDeckAnalyzeForMobile,
  runDeckAnalyzeCore,
} from "@/lib/deck/analyze-service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let requestMode: "deckId" | "deckText" | "unknown" = "unknown";
    try {
      const payload = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
      const hasDeckId = typeof payload.deckId === "string" && payload.deckId.trim().length > 0;
      const hasDeckText =
        typeof payload.deckText === "string" && payload.deckText.trim().length > 0;
      requestMode = hasDeckId ? "deckId" : hasDeckText ? "deckText" : "unknown";
    } catch {
      requestMode = "unknown";
    }
    const coreRes = await runDeckAnalyzeCore(req);
    const status = coreRes.status;
    const body = (await coreRes.json().catch(() => ({}))) as Record<string, unknown>;
    const normalized = normalizeDeckAnalyzeForMobile({
      status,
      ok: coreRes.ok,
      body,
    });
    const validationErrors = Array.isArray((normalized as Record<string, unknown>).validationErrors)
      ? ((normalized as Record<string, unknown>).validationErrors as unknown[])
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    console.log("[mobile/deck/analyze]", {
      status,
      requestMode,
      ok: (normalized as Record<string, unknown>).ok,
      partial: (normalized as Record<string, unknown>).partial,
      code: (normalized as Record<string, unknown>).code,
      validationErrorCount: validationErrors.length,
      validationErrorSample: validationErrors[0]?.slice(0, 200),
      analysisNulled:
        (normalized as Record<string, unknown>).analysis === null &&
        (normalized as Record<string, unknown>).analysis_json === null,
    });
    return NextResponse.json(normalized, { status });
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

