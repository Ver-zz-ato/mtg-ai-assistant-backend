// app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  const body = await req.json().catch(() => ({}));
  const row = {
    user_id: user?.id ?? null,
    email: user?.email ?? (typeof body.email === "string" ? body.email : null),
    rating: typeof body.rating === "number" ? body.rating : null,
    text: String(body.text || "").slice(0, 2000),
  };

  const { error } = await supabase.from("feedback").insert(row);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("feedback_sent", { user_id: row.user_id, rating: row.rating }); } catch {}
  return NextResponse.json({ ok: true });
}
