import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";
import { getAdmin } from "@/app/api/_lib/supa";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";

export const runtime = "nodejs";
export const maxDuration = 120;

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

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client required" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key required" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { review_id, notes } = body;
    if (!review_id) {
      return NextResponse.json({ ok: false, error: "review_id required" }, { status: 400 });
    }

    const { data: review, error: revErr } = await supabase
      .from("ai_human_reviews")
      .select("*")
      .eq("id", review_id)
      .single();

    if (revErr || !review) {
      return NextResponse.json({ ok: false, error: "Review not found" }, { status: 404 });
    }

    const promptKind = review.route?.includes("deck") ? "deck_analysis" : "chat";
    const currentPrompt = await getPromptVersion(promptKind);
    if (!currentPrompt) {
      return NextResponse.json({ ok: false, error: "No current prompt" }, { status: 400 });
    }

    const inputPreview = typeof review.input === "object" && review.input?.prompt_preview
      ? review.input.prompt_preview
      : typeof review.input === "string"
        ? review.input
        : JSON.stringify(review.input || {}).slice(0, 1000);
    const outputPreview = String(review.output || "").slice(0, 1500);
    const issueLabel = (review.labels as any)?.quick || "generic_issue";

    const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        prepareOpenAIBody({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You suggest a small prompt patch (additions or edits) to address a human-reviewed AI failure. The reviewer labeled this as: ${issueLabel}. Return JSON: { "patch_snippet": "exact text to add or replace (1-3 sentences)", "rationale": "brief", "insert_after": "optional section header to insert after" }. Be minimal and safe.`,
            },
            {
              role: "user",
              content: `Input: ${inputPreview}\n\nOutput (problematic): ${outputPreview}\n\n${notes || ""}\n\nCurrent prompt (first 1500 chars):\n${currentPrompt.system_prompt.slice(0, 1500)}`,
            },
          ],
          max_completion_tokens: 500,
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
    const patchedPrompt = currentPrompt.system_prompt + "\n\n--- Human Review Patch ---\n" + (parsed.patch_snippet || "");

    const { data: ver } = await admin
      .from("prompt_versions")
      .insert({
        kind: promptKind,
        version: `patch-from-review-${ts}`,
        system_prompt: patchedPrompt,
        meta: { source: "suggest_prompt_patch", review_id, rationale: parsed.rationale },
        status: "candidate",
      })
      .select("id, version")
      .single();

    if (!ver) {
      return NextResponse.json({ ok: false, error: "Failed to create prompt version" }, { status: 500 });
    }

    const { data: proposal } = await supabase
      .from("ai_prompt_change_proposals")
      .insert({
        created_by: user.email || user.id,
        status: "pending",
        kind: promptKind,
        active_prompt_version_id: currentPrompt.id,
        candidate_prompt_version_ids: [ver.id],
        recommended_prompt_version_id: ver.id,
        rationale_eli5: `Patch from human review (${issueLabel}): ${parsed.rationale || ""}`,
        rationale_full: `Suggested patch from review ${review_id}. Patch: ${parsed.patch_snippet || ""}`,
        diff_summary: { patch_snippet: parsed.patch_snippet },
        evidence: { review_id, suggest_patch: true },
        risk_assessment: { confidence: 0.5 },
      })
      .select("id")
      .single();

    return NextResponse.json({
      ok: true,
      proposal_id: proposal?.id,
      prompt_version_id: ver.id,
      patch_snippet: parsed.patch_snippet,
      rationale: parsed.rationale,
      message: "Patch created as candidate. Review in Proposal panel before adopting.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
