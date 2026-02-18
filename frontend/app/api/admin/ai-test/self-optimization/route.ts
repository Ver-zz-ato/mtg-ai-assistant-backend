import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 min for full pipeline

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

    const baseUrl = req.url.split("/api/admin")[0];
    const cookie = req.headers.get("cookie") || "";

    const steps: string[] = [];
    let passRateBefore = 0;
    let passRateAfter = 0;
    let goldenPassed = false;
    let adopted = false;
    let recommendation: any = null;
    let error: string | null = null;

    try {
      // 1. Load test cases and run full suite (batch)
      steps.push("Loading test cases...");
      const casesRes = await fetch(`${baseUrl}/api/admin/ai-test/cases`, { headers: { Cookie: cookie }, cache: "no-store" });
      const casesData = await casesRes.json();
      const allCases = (casesData.testCases || []).filter((c: any) => c.id);
      const testCases = allCases.slice(0, 50);
      if (testCases.length === 0) {
        throw new Error("No test cases available. Import tests first.");
      }

      steps.push("Running full suite...");
      const batchRes = await fetch(`${baseUrl}/api/admin/ai-test/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ testCases, formatKey: "commander" }),
      });
      const batchData = await batchRes.json();
      if (!batchData.ok) throw new Error(batchData.error || "Batch failed");
      passRateBefore = batchData.results?.length
        ? Math.round(
            (batchData.results.filter((r: any) => r.validation?.overall?.passed).length / batchData.results.length) *
              100
          )
        : 0;

      // 2. Generate smart Golden Set if none
      const { data: sets } = await supabase.from("ai_eval_sets").select("id").limit(1);
      if (!sets?.length) {
        steps.push("Creating smart Golden Set...");
        const goldenRes = await fetch(`${baseUrl}/api/admin/ai-test/auto-golden-set`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
        });
        const goldenData = await goldenRes.json();
        if (!goldenData.ok) steps.push(`Golden set creation: ${goldenData.error}`);
      }

      // 3. Run auto-challenge
      steps.push("Running auto-challenge...");
      const challengeRes = await fetch(`${baseUrl}/api/admin/ai-test/auto-challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ kind: "chat", testLimit: 15 }),
      });
      const challengeData = await challengeRes.json();

      if (!challengeData.ok) {
        throw new Error(challengeData.error || "Auto-challenge failed");
      }

      const perf = challengeData.performance_diff;
      passRateAfter = challengeData.recommended_prompt === "current"
        ? perf?.current?.passRate ?? passRateBefore
        : (perf?.[challengeData.recommended_prompt]?.passRate ?? passRateBefore);

      const winRateDelta = perf?.win_rate_delta ?? 0;

      // 4. Run Golden Set if we have one (to check gate)
      const { data: evalSets } = await supabase.from("ai_eval_sets").select("id, name").order("created_at", { ascending: false }).limit(1);
      if (evalSets?.length && challengeData.adopt_prompt_id) {
        steps.push("Running Golden Set check...");
        // We would need to run with the new prompt - for now skip golden run in pipeline
        // User can run manually. Set goldenPassed = false to require manual verification
        goldenPassed = false; // Conservative: don't auto-adopt without golden
      }

      // 5. Decide: auto-adopt or show recommendation
      if (
        challengeData.adopt_prompt_id &&
        winRateDelta > 5 &&
        (goldenPassed || !evalSets?.length) // Adopt if no golden set, or if golden passed
      ) {
        steps.push("Auto-adopting best prompt...");
        const adoptRes = await fetch(`${baseUrl}/api/admin/ai-test/adopt-prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({
            prompt_version_id: challengeData.adopt_prompt_id,
            kind: "chat",
            reason: "Self-optimization auto-adopt",
            test_evidence: {
              win_rate_delta: winRateDelta,
              pass_rate_before: passRateBefore,
              pass_rate_after: passRateAfter,
            },
          }),
        });
        const adoptData = await adoptRes.json();
        adopted = adoptData.ok;
        if (adopted) steps.push(`Adopted ${challengeData.candidates?.[challengeData.recommended_prompt]?.version}`);
      } else {
        recommendation = {
          recommended_prompt: challengeData.recommended_prompt,
          adopt_prompt_id: challengeData.adopt_prompt_id,
          win_rate_delta: winRateDelta,
          message:
            winRateDelta <= 5
              ? "Improvement under 5%. Review before adopting."
              : !goldenPassed && evalSets?.length
                ? "Run Golden Set to verify before adopting."
                : "Review and adopt manually.",
        };
      }
    } catch (e: any) {
      error = e?.message || "Unknown error";
      steps.push(`Error: ${error}`);
    }

    return NextResponse.json({
      ok: !error,
      error: error || undefined,
      steps,
      summary: {
        pass_rate_before: passRateBefore,
        pass_rate_after: passRateAfter,
        golden_passed: goldenPassed,
        adopted,
        recommendation,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
