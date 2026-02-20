import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50", 10)));
    const maxRating = searchParams.get("maxRating"); // e.g. "2" = show rating ≤ 2 (low ratings)
    const minRating = searchParams.get("minRating"); // e.g. "4" = show rating ≥ 4 (high ratings)

    let query = supabase
      .from("feedback")
      .select("id, user_id, email, rating, text, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (maxRating !== null && maxRating !== undefined && maxRating !== "") {
      const r = parseInt(maxRating, 10);
      if (!isNaN(r)) query = query.lte("rating", r);
    }
    if (minRating !== null && minRating !== undefined && minRating !== "") {
      const r = parseInt(minRating, 10);
      if (!isNaN(r)) query = query.gte("rating", r);
    }

    const from = (page - 1) * limit;
    const { data: rows, error, count } = await query.range(from, from + limit - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      feedback: rows || [],
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > from + (rows?.length ?? 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
