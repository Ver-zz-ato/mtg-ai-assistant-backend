import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { checkMaintenance } = await import('@/lib/maintenance-check');
    const maint = await checkMaintenance();
    if (maint.enabled) {
      return NextResponse.json({ ok: false, error: maint.message }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const testCaseId = body?.testCaseId;
    const testCase = body?.testCase; // Can pass test case directly

    if (!testCaseId && !testCase) {
      return NextResponse.json({ ok: false, error: "testCaseId or testCase required" }, { status: 400 });
    }

    // Load test case if ID provided
    let finalTestCase = testCase;
    if (testCaseId && !testCase) {
      // Try DB first
      const { data: dbCase } = await supabase
        .from("ai_test_cases")
        .select("*")
        .eq("id", testCaseId)
        .single();

      if (dbCase) {
        finalTestCase = {
          id: dbCase.id,
          name: dbCase.name,
          type: dbCase.type,
          input: dbCase.input,
          expectedChecks: dbCase.expected_checks,
          tags: dbCase.tags || [],
          source: dbCase.source,
        };
      } else {
        // Try JSON file
        const testCases = await import("@/lib/data/ai_test_cases.json");
        const found = testCases.testCases.find((tc: any) => tc.id === testCaseId);
        if (found) {
          finalTestCase = found;
        }
      }
    }

    if (!finalTestCase) {
      return NextResponse.json({ ok: false, error: "test case not found" }, { status: 404 });
    }

    const { type, input } = finalTestCase;
    const formatKey = body?.formatKey ?? input?.format;
    let responseText = "";
    let promptUsed: { system?: string; user?: string; prompt_version_id?: string | null } = {};
    let error: string | null = null;

    try {
      if (type === "chat") {
        const baseUrl = req.url.split("/api/admin")[0];
        const chatResponse = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            text: input.userMessage,
            threadId: null,
            prefs: {
              format: formatKey ?? input?.format,
              teaching: input.context?.teaching || false,
            },
            context: input.context,
          }),
        });

        const chatData = await chatResponse.json();
        if (chatData.fallback) {
          error = chatData.error || chatData.reason || "Chat API returned fallback";
        } else {
          responseText = chatData.text || "";
          // Note: Prompt version ID would be available if chat route logged it
          // For now, we'll note that prompts are built dynamically
          promptUsed = {
            system: "[Built dynamically in /api/chat]",
            user: input.userMessage,
            prompt_version_id: chatData.prompt_version_id || null,
          };
        }
      } else if (type === "deck_analysis") {
        // Call deck analysis API
        const baseUrl = req.url.split("/api/admin")[0];
        const analysisResponse = await fetch(`${baseUrl}/api/deck/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            deckText: input.deckText || "",
            userMessage: input.userMessage,
            format: input.format || "Commander",
            commander: input.commander,
            colors: input.colors || [],
            plan: input.context?.plan || "Optimized",
            currency: input.context?.currency || "USD",
          }),
        });

        const analysisData = await analysisResponse.json();
        if (analysisData.error) {
          error = analysisData.error;
        } else {
          // Format deck analysis response
          const suggestions = analysisData.suggestions || [];
          const whatsGood = analysisData.whatsGood || [];
          const quickFixes = analysisData.quickFixes || [];

          responseText = [
            ...whatsGood.map((msg: string) => `✅ ${msg}`),
            ...quickFixes.map((msg: string) => `⚠️ ${msg}`),
            ...suggestions.map((s: any) => `💡 ${s.card}: ${s.reason || ""}`),
          ].join("\n");

          promptUsed = {
            system: "[Built dynamically in /api/deck/analyze]",
            user: input.userMessage || "Analyze this deck",
            prompt_version_id: analysisData.prompt_version_id || null,
          };
        }
      } else {
        error = `Unknown test type: ${type}`;
      }
    } catch (e: any) {
      error = e.message || "Failed to run test";
    }

    return NextResponse.json({
      ok: true,
      testCase: finalTestCase,
      response: {
        text: responseText,
        promptUsed,
        error,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

