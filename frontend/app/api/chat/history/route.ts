// app/api/chat/history/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "../../_lib/supabase";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json<Envelope<never>>({ ok: false, error: "Unauthenticated" }, { status: 401 });
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id,title,deck_id,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json<Envelope<never>>({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json<Envelope<typeof data>>({ ok: true, data });
  } catch (e:any) {
    return NextResponse.json<Envelope<never>>({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
