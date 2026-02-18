import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";
import { getAdmin } from "@/app/api/_lib/supa";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";

export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client required" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key required" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { direction = "more_strict", notes } = body;

    const { data: proposal, error: propErr } = await supabase
      .from("ai_prompt_change_proposals")
      .select("*")
      .eq("id", id)
      .eq("status", "pending")
      .single();

    if (propErr || !proposal) {
      return NextResponse.json({ ok: false, error: "Proposal not found or not pending" }, { status: 404 });
    }

    const kind = proposal.kind || "chat";
    const promptKind = kind === "deck_analysis" ? "deck_analysis" : "chat";
    const currentPrompt = await getPromptVersion(promptKind);
    if (!currentPrompt) {
      return NextResponse.json({ ok: false, error: "No current prompt" }, { status: 400 });
    }

    const dirPrompt: Record<string, string> = {
      more_strict: "Make the prompt stricter: enforce rules more rigorously, add guardrails.",
      more_concise: "Make the prompt more concise: shorten instructions, remove redundancy.",
      more_helpful: "Make the prompt more helpful: add examples, clarify guidance.",
      more_budget_focus: "Strengthen budget/price awareness and cheaper alternatives.",
      more_rules_focus: "Strengthen rules/legality enforcement and format compliance.",
    };
    const directionText = dirPrompt[direction] || dirPrompt.more_strict;

    const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        prepareOpenAIBody({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Generate an improved prompt variant. Direction: ${directionText}. ${notes || ""} Return JSON: { "system_prompt": "full prompt text", "rationale": "brief" }`,
            },
            { role: "user", content: `Current prompt:\n${currentPrompt.system_prompt.slice(0, 3000)}` },
          ],
          max_completion_tokens: 8000,
          response_format: { type: "json_object" },
        } as Record<string, unknown>)
      ),
    });
    const llmData = await llmRes.json();
    const content = llmData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ ok: false, error: "LLM failed" }, { status: 500 });
    }
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid LLM JSON" }, { status: 500 });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const { data: verD } = await admin
      .from("prompt_versions")
      .insert({
        kind: promptKind,
        version: `proposal-D-${direction}-${ts}`,
        system_prompt: parsed.system_prompt || currentPrompt.system_prompt,
        meta: { source: "proposal-regenerate", direction, rationale: parsed.rationale },
        status: "candidate",
        created_from_proposal_id: id,
      })
      .select("id, version")
      .single();

    if (!verD) {
      return NextResponse.json({ ok: false, error: "Failed to create candidate D" }, { status: 500 });
    }

    // Get test case IDs from golden set (ai_test_cases only; pairwise doesn't support ai_dynamic_test_cases)
    const evidence = (proposal.evidence || {}) as Record<string, unknown>;
    let testCaseIds: string[] = [];
    const goldenSetId = evidence.golden_set_id as string | undefined;
    if (goldenSetId) {
      const { data: gs } = await supabase.from("ai_eval_sets").select("test_case_ids").eq("id", goldenSetId).single();
      testCaseIds = ((gs?.test_case_ids as string[]) || []).slice(0, 15);
    }
    if (testCaseIds.length === 0) {
      const { data: fallback } = await supabase.from("ai_test_cases").select("id").limit(15);
      testCaseIds = (fallback || []).map((r: any) => r.id);
    }

    const baseUrl = req.url.split("/api/admin")[0];
    const cookie = req.headers.get("cookie") || "";

    const pwRes = await fetch(`${baseUrl}/api/admin/ai-test/pairwise`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        test_case_ids: testCaseIds.length ? testCaseIds : undefined,
        prompt_version_id_a: currentPrompt.id,
        prompt_version_id_b: verD.id,
        judge_mode: "close_calls",
      }),
    });
    const pwData = await pwRes.json();

    if (!pwData.ok) {
      return NextResponse.json({ ok: false, error: pwData.error || "Pairwise failed" }, { status: 500 });
    }

    const winRateD = pwData.summary?.winRateBByJudge ?? 0;
    const winRateDeltaD = winRateD - 50;

    const existingCandidates = (proposal.candidate_prompt_version_ids || []) as string[];
    const newCandidates = [...existingCandidates, verD.id];

    await supabase
      .from("ai_prompt_change_proposals")
      .update({
        candidate_prompt_version_ids: newCandidates,
        evidence: {
          ...evidence,
          pairwise_A_vs_D: pwData.evalRunId,
          regenerate_direction: direction,
        },
        rationale_eli5: `${proposal.rationale_eli5}\n\nRegenerated with "${direction}": Candidate D +${winRateDeltaD.toFixed(1)}% win rate.`,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      message: `Added candidate D (${verD.version})`,
      candidate_id: verD.id,
      win_rate_delta_D: winRateDeltaD,
      pairwise_summary: pwData.summary,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
