import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";

export async function GET(req: NextRequest) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let status = 200;
  let userId: string | null = null;

  try {
    const url = new URL(req.url);
    const deckId = url.searchParams.get("deckId");

    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (!user) {
      status = 401;
      return NextResponse.json({ ok: false, error: { message: authError?.message || "Not authenticated" } }, { status });
    }
    userId = user.id;

    let q = supabase
      .from("chat_threads")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
.limit(30);

    if (deckId) q = q.eq("deck_id", deckId);

    const { data, error } = await q;

    if (error) {
      status = 500;
      return NextResponse.json({ ok: false, error: { message: error.message } }, { status });
    }

    // Contract: { ok:true, data:[...] }
    return NextResponse.json({ ok: true, data: data ?? [], threads: data ?? [] }, { status });
  } finally {
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const ms = Math.round((t1 as number) - (t0 as number));
    console.log(JSON.stringify({ method: "GET", path: "/api/chat/threads/list", status, ms, userId }));
  }
}
