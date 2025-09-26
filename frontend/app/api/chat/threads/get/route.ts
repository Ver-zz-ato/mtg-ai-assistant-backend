// app/api/chat/threads/get/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient(); // call before awaits

    // Assuming you have a chat_threads table with user scoping.
    const client: any = await (supabase as any);
    const { data, error } = await client
      .from("chat_threads")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[threads/get] supabase error:", error);
      return NextResponse.json({ ok: true, threads: [] });
    }

    return NextResponse.json({ ok: true, threads: data || [] });
  } catch (err) {
    console.error("[threads/get] error:", err);
    return NextResponse.json({ ok: true, threads: [] });
  }
}