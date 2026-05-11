export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { extractCommanderFromDecklistText } from "@/lib/chat/decklistDetector";
import { buildDeckRoastSystemPrompt } from "@/lib/prompts/deck-roast";

const VALID_FORMATS = ["Commander", "Modern", "Pioneer", "Standard", "Pauper"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage =
      (typeof body.sourcePage === "string" ? body.sourcePage : typeof body.source_page === "string" ? body.source_page : null)?.trim() || null;
    const deckText = String(body?.deckText || "").trim();
    const format = String(body?.format || "Commander").trim();
    const commanderName = typeof body?.commanderName === "string" ? body.commanderName.trim() || null : null;
    const rawSavageness = typeof body?.savageness === "number" ? body.savageness : (body?.keepFriendly === false ? 8 : 5);
    const savageness = Math.max(1, Math.min(10, Math.round(rawSavageness)));

    if (!deckText) {
      return NextResponse.json({ ok: false, error: "deckText required" }, { status: 400 });
    }

    if (!VALID_FORMATS.includes(format as any)) {
      return NextResponse.json(
        { ok: false, error: `format must be one of: ${VALID_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    // Parse deck
    const parsed = parseDeckText(deckText);
    if (parsed.length === 0) {
      return NextResponse.json({ ok: false, error: "Decklist is empty" }, { status: 400 });
    }

    // Validate/fix card names via parse-and-fix-names
    let cards = parsed;
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (typeof req.url === "string" ? new URL(req.url).origin : "http://localhost:3000");
      const fixRes = await fetch(`${baseUrl}/api/deck/parse-and-fix-names`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText }),
      });
      const fixData: any = await fixRes.json().catch(() => ({}));
      if (fixData?.ok && Array.isArray(fixData.cards) && fixData.cards.length > 0) {
        cards = fixData.cards.map((c: { name: string; qty: number }) => ({ name: c.name, qty: c.qty }));
      }
    } catch (e) {
      console.warn("[deck/roast] Name fixing failed, using original:", (e as Error)?.message);
    }

    // Resolve commander (user-set wins over extracted)
    let commander: string | null = commanderName;
    if (format === "Commander" && !commander) {
      commander = extractCommanderFromDecklistText(deckText);
    } else if (format !== "Commander") {
      commander = null;
    }

    const deckSummary = {
      cards,
      totalCards: cards.reduce((sum, c) => sum + c.qty, 0),
    };

    const systemPrompt = buildDeckRoastSystemPrompt(deckSummary, format, commander, savageness);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const { callLLM } = await import("@/lib/ai/unified-llm-client");
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Roast this deck." },
      ],
      {
        route: "/api/deck/roast",
        feature: "deck_roast",
        model: "gpt-4o-mini",
        fallbackModel: "gpt-4o-mini",
        maxTokens: 4096,
        apiType: "chat",
        userId: null,
        isPro: false,
        source_page: sourcePage,
        source: usageSource ?? null,
      }
    );

    const roast = (response.text || "").trim().replace(/\{\{([^{}]+)\}\}/g, "[[$1]]");
    return NextResponse.json({ ok: true, roast, roastScore: savageness });
  } catch (e) {
    const message = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
