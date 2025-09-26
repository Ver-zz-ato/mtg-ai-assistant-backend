// app/api/chat/debug/last/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "../../../_lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const tid = req.nextUrl.searchParams.get("threadId");
    if (!tid) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });

    const t = await supabase.from("chat_threads").select("id,user_id").eq("id", tid).single();
    if (t.error || !t.data || (t.data as any).user_id !== user.id) return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });

    const row = await supabase.from("chat_messages")
      .select("id,role,content,created_at")
      .eq("thread_id", tid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (row.error) return NextResponse.json({ ok: false, error: row.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: row.data ?? null });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
