import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

/**
 * GET /api/health-report/share/[id] — public read of saved snapshot (unlisted link).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }
    const { id } = await context.params;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("shared_health_reports")
      .select("id, deck_id, snapshot_json, created_at, user_id")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      deck_id: data.deck_id,
      snapshot_json: data.snapshot_json,
      created_at: data.created_at,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
