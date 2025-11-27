import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { validateResponse } from "@/lib/ai/test-validator";

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

/**
 * Calculate consistency score based on response variance
 * Returns 0-100, where 100 = perfectly consistent
 */
function calculateConsistencyScore(responses: string[]): number {
  if (responses.length < 2) return 100;

  // Simple approach: compare response lengths and keyword overlap
  const lengths = responses.map(r => r.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const lengthVariance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
  const lengthStdDev = Math.sqrt(lengthVariance);
  const lengthConsistency = Math.max(0, 100 - (lengthStdDev / avgLength) * 100);

  // Keyword overlap between responses
  const extractKeywords = (text: string): Set<string> => {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    return new Set(words);
  };

  const keywordSets = responses.map(extractKeywords);
  let totalOverlap = 0;
  let comparisons = 0;

  for (let i = 0; i < keywordSets.length; i++) {
    for (let j = i + 1; j < keywordSets.length; j++) {
      const set1 = keywordSets[i];
      const set2 = keywordSets[j];
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      const overlap = union.size > 0 ? (intersection.size / union.size) * 100 : 0;
      totalOverlap += overlap;
      comparisons++;
    }
  }

  const keywordConsistency = comparisons > 0 ? totalOverlap / comparisons : 100;

  // Combined score (weighted average)
  const consistency = (lengthConsistency * 0.3) + (keywordConsistency * 0.7);
  return Math.round(Math.max(0, Math.min(100, consistency)));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { testCaseId, runs = 5 } = body;

    if (!testCaseId) {
      return NextResponse.json({ ok: false, error: "testCaseId required" }, { status: 400 });
    }

    // Get test case
    const { data: testCase, error: caseError } = await supabase
      .from("ai_test_cases")
      .select("*")
      .eq("id", testCaseId)
      .single();

    if (caseError || !testCase) {
      return NextResponse.json({ ok: false, error: "Test case not found" }, { status: 404 });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const baseUrl = req.url.split("/api/admin")[0];

    // Run the test multiple times
    const responses: string[] = [];
    const validations: any[] = [];

    for (let i = 0; i < runs; i++) {
      try {
        let responseText = "";

        if (testCase.type === "chat") {
          const chatResponse = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              text: testCase.input.userMessage,
              prefs: {
                format: testCase.input.format,
                teaching: testCase.input.context?.teaching || false,
              },
              context: testCase.input.context,
              noUserInsert: true,
            }),
          });

          const chatData = await chatResponse.json();
          if (chatResponse.ok && !chatData.fallback) {
            responseText = chatData.text || "";
          }
        } else if (testCase.type === "deck_analysis") {
          const analysisResponse = await fetch(`${baseUrl}/api/deck/analyze`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              deckText: testCase.input.deckText || "",
              userMessage: testCase.input.userMessage,
              format: testCase.input.format || "Commander",
              commander: testCase.input.commander,
              colors: testCase.input.colors || [],
            }),
          });

          const analysisData = await analysisResponse.json();
          if (analysisResponse.ok && !analysisData.error) {
            const suggestions = analysisData.suggestions || [];
            const whatsGood = analysisData.whatsGood || [];
            const quickFixes = analysisData.quickFixes || [];
            responseText = [
              ...whatsGood.map((msg: string) => `✅ ${msg}`),
              ...quickFixes.map((msg: string) => `⚠️ ${msg}`),
              ...suggestions.map((s: any) => `💡 ${s.card}: ${s.reason || ""}`),
            ].join("\n");
          }
        }

        if (responseText) {
          responses.push(responseText);

          // Validate this run
          const validation = await validateResponse(
            responseText,
            testCase,
            {
              runKeywordChecks: true,
              runLLMFactCheck: false, // Skip LLM judge for consistency test
              runReferenceCompare: false,
              apiKey: undefined,
              supabase: undefined,
            }
          );
          validations.push(validation);
        }
      } catch (e: any) {
        console.error(`[consistency] Run ${i + 1} failed:`, e);
      }
    }

    if (responses.length < 2) {
      return NextResponse.json({
        ok: false,
        error: `Not enough successful runs (got ${responses.length}, need at least 2)`,
      }, { status: 400 });
    }

    // Calculate consistency score
    const consistencyScore = calculateConsistencyScore(responses);

    // Update test case with consistency score
    await supabase
      .from("ai_test_cases")
      .update({ consistency_score: consistencyScore })
      .eq("id", testCaseId);

    // Calculate pass rate across runs
    const passCount = validations.filter(v => v.overall?.passed === true).length;
    const passRate = validations.length > 0 ? (passCount / validations.length) * 100 : 0;

    return NextResponse.json({
      ok: true,
      consistencyScore,
      passRate: Math.round(passRate),
      runs: responses.length,
      responses: responses.map((r, i) => ({
        response: r.slice(0, 200) + (r.length > 200 ? "..." : ""),
        validation: validations[i]?.overall,
      })),
      isFlaky: consistencyScore < 80,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



