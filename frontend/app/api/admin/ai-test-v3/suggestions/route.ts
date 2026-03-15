import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

const SCOPES = ["prompt", "rules", "deck-intelligence", "state", "validator", "ui"] as const;

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  let query = supabase.from("ai_test_improvement_suggestions").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, suggestions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  let body: {
    run_id?: string;
    result_ids?: string[];
    scope?: string;
    suggestion_text?: string;
    rationale_text?: string;
    confidence?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.suggestion_text || typeof body.suggestion_text !== "string") {
    return NextResponse.json({ ok: false, error: "suggestion_text required" }, { status: 400 });
  }
  if (!body.scope || !SCOPES.includes(body.scope as typeof SCOPES[number])) {
    return NextResponse.json({ ok: false, error: "scope must be one of: " + SCOPES.join(", ") }, { status: 400 });
  }
  const source_result_ids_json = Array.isArray(body.result_ids) ? body.result_ids : [];
  const { data, error } = await supabase
    .from("ai_test_improvement_suggestions")
    .insert({
      run_id: body.run_id ?? null,
      source_result_ids_json: source_result_ids_json,
      scope: body.scope,
      suggestion_text: body.suggestion_text,
      rationale_text: body.rationale_text ?? null,
      confidence: body.confidence ?? null,
      status: "pending",
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, suggestion: data });
}
