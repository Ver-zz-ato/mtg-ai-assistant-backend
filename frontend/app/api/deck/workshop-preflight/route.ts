import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { assessWorkshopSourceDeck } from "@/lib/deck/workshop-source-assessment";
import { tryDeckFormatStringToAnalyzeFormat } from "@/lib/deck/formatRules";

export const runtime = "nodejs";

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

    const body = await req.json().catch(() => ({}));
    const deckText = typeof body.deckText === "string" ? body.deckText.trim() : "";
    const format = typeof body.format === "string" && body.format.trim() ? body.format.trim() : "Commander";
    const commander = typeof body.commander === "string" ? body.commander.trim() || null : null;

    if (!deckText || deckText.length < 5) {
      return NextResponse.json({ ok: false, error: "deckText is required" }, { status: 400 });
    }
    if (deckText.length > 120_000) {
      return NextResponse.json({ ok: false, error: "deckText exceeds maximum length" }, { status: 400 });
    }

    const analyzeFormat = tryDeckFormatStringToAnalyzeFormat(format);
    if (!analyzeFormat) {
      return NextResponse.json(
        { ok: false, error: "Unsupported format. Use Commander, Modern, Pioneer, Standard, or Pauper." },
        { status: 400 },
      );
    }

    const assessment = await assessWorkshopSourceDeck({
      sourceDeckText: deckText,
      format,
      commander,
    });

    return NextResponse.json({
      ok: true,
      format: analyzeFormat,
      expectedLegality: assessment.expectedLegality,
      severity: assessment.severity,
      issueSummary: assessment.issueSummary,
      messages: assessment.messages,
      suggestFixLegalityFirst: assessment.suggestFixLegalityFirst,
    });
  } catch (error) {
    console.error("[deck/workshop-preflight] error:", error);
    return NextResponse.json({ ok: false, error: "Preflight check failed" }, { status: 500 });
  }
}
