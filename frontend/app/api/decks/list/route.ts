import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
export async function GET() {
const supabase = await createClient();


  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // Select * to avoid referencing non-existent columns (e.g., 'name')
  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, decks: data ?? [] });
}
