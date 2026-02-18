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

    const body = await req.json().catch(() => ({}));
    const { review_id } = body;
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

    const input = review.input || {};
    const promptPreview = input.prompt_preview || (typeof input === "string" ? input : JSON.stringify(input));
    const userMessage = typeof promptPreview === "string" ? promptPreview.slice(0, 2000) : "";
    const output = review.output || "";

    const { data: inserted, error: insertErr } = await supabase
      .from("ai_test_cases")
      .insert({
        name: `From review ${review_id.slice(0, 8)}`,
        type: review.route?.includes("deck") ? "deck_analysis" : "chat",
        input: {
          userMessage: userMessage || "Analyze this request.",
          deckText: input.deckText || "",
          format: input.format || "Commander",
        },
        expected_checks: { reference: output.slice(0, 500), source: "human_review" },
        tags: ["human_review", `review_id:${review_id}`],
        source: "human_review",
      })
      .select("id, name")
      .single();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      test_case_id: inserted.id,
      name: inserted.name,
      message: "Test case created. Add expected checks in Advanced Mode.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
