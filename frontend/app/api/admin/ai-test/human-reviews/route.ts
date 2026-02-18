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

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam === "all" ? undefined : (statusParam || "pending");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const route = url.searchParams.get("route") || undefined;
    const label = url.searchParams.get("label") || undefined;
    const deckId = url.searchParams.get("deck_id") || undefined;
    const unreviewedOnly = url.searchParams.get("unreviewed_only") === "true";

    let query = supabase
      .from("ai_human_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (unreviewedOnly) query = query.eq("status", "pending");
    if (route) query = query.eq("route", route);
    if (deckId) query = query.filter("meta->>deck_id", "eq", deckId);
    if (label) query = query.eq("labels->>quick", label);

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reviews: rows || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, labels, reviewer, status } = body;

    if (id) {
      const updates: Record<string, unknown> = {};
      if (labels !== undefined) updates.labels = labels;
      if (reviewer !== undefined) updates.reviewer = reviewer;
      if (status !== undefined) updates.status = status;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("ai_human_reviews")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, review: data });
    }

    return NextResponse.json({ ok: false, error: "id required for update" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
