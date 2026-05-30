import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return NextResponse.json({ ok: !error, user, error: error?.message ?? null });
}
