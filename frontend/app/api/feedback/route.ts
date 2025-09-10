import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore, headers: () => headerStore });

    const body = await req.json().catch(() => ({}));
    const { rating, text, email } = body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });
    }

    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id ?? null;

    const { error } = await supabase.from("feedback").insert({
      user_id, email: email ?? null, rating: typeof rating === "number" ? rating : null, text: text.trim(),
    });

    if (error) {
      console.error("feedback insert error", error);
      // Don't fail the UX if table not ready: log-and-accept (MVP fallback)
      return NextResponse.json({ ok: true, stored: false, note: "Logged only (create table to store)" });
    }
    return NextResponse.json({ ok: true, stored: true });
  } catch (e:any) {
    console.error("feedback error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Feedback error" }, { status: 500 });
  }
}
