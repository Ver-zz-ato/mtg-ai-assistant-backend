// app/api/chat/threads/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "../../../_lib/supabase";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function GET(req: NextRequest) {
  try {
    const tid = req.nextUrl.searchParams.get("threadId");
    if (!tid) return NextResponse.json<Envelope<never>>({ ok: false, error: "threadId required" }, { status: 400 });
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json<Envelope<never>>({ ok: false, error: "Unauthenticated" }, { status: 401 });

    const { data: t, error: tErr } = await supabase.from("chat_threads").select("id,user_id").eq("id", tid).single();
    if (tErr || !t || (t as any).user_id !== user.id) return NextResponse.json<Envelope<never>>({ ok: false, error: "Thread not found" }, { status: 404 });

    const { data: msgs, error } = await supabase.from("chat_messages")
      .select("id,role,content,created_at")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json<Envelope<never>>({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json<Envelope<typeof msgs>>({ ok: true, data: msgs });
  } catch (e:any) {
    return NextResponse.json<Envelope<never>>({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
