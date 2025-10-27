// app/api/collections/delete/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { id } = body || {};
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const { data: col, error: cErr } = await supabase.from("collections").select("id, user_id").eq("id", id).single();
    if (cErr || !col) return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });
    if (col.user_id !== user.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Delete child rows first (FK may not cascade)
    const { error: delCardsErr } = await supabase.from("collection_cards").delete().eq("collection_id", id);
    if (delCardsErr) return NextResponse.json({ ok: false, error: delCardsErr.message }, { status: 500 });

    const { error: delColErr } = await supabase.from("collections").delete().eq("id", id);
    if (delColErr) return NextResponse.json({ ok: false, error: delColErr.message }, { status: 500 });

    // ANALYTICS: Track collection deletion
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("collection_deleted", { collection_id: id, user_id: user.id }); } catch {}

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
