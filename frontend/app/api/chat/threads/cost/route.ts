import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export async function GET(req: NextRequest) {
  // Hidden to end users; no public exposure of AI cost totals.
  return NextResponse.json({ ok: false, error: "not_available" }, { status: 404 });
}