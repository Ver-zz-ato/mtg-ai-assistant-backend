import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: { is_active?: boolean; expected_fix_notes?: string; severity?: string; title?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;
  if (body.expected_fix_notes !== undefined) update.expected_fix_notes = body.expected_fix_notes;
  if (body.severity !== undefined) update.severity = body.severity;
  if (body.title !== undefined) update.title = body.title;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("ai_test_regressions")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, regression: data });
}
