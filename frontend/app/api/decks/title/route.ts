// app/api/decks/title/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { containsProfanity, sanitizeName } from "@/lib/profanity";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ ok:false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null) as { id?: string; title?: string } | null;
    if (!body?.id) return NextResponse.json({ ok:false, error: "id required" }, { status: 400 });
    const nextRaw = (body.title ?? "").toString();
    const next = sanitizeName(nextRaw, 120);
    if (containsProfanity(next)) return NextResponse.json({ ok:false, error: "Please choose a different name." }, { status: 400 });

    const { error } = await supabase
      .from("decks")
      .update({ title: next || "Untitled Deck" })
      .eq("id", body.id)
      .eq("user_id", u.user.id);

    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Server error" }, { status: 500 });
  }
}
