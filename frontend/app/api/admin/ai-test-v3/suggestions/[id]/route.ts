import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

const STATUSES = ["pending", "approved", "rejected", "implemented"] as const;

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
  let body: { status?: string; reviewer_note?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as typeof STATUSES[number])) {
      return NextResponse.json({ ok: false, error: "status must be one of: " + STATUSES.join(", ") }, { status: 400 });
    }
    update.status = body.status;
    if (body.status !== "pending") update.reviewed_at = new Date().toISOString();
  }
  if (body.reviewer_note !== undefined) update.reviewer_note = body.reviewer_note;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("ai_test_improvement_suggestions")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, suggestion: data });
}
