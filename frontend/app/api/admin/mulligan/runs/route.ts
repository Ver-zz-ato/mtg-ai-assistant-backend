import { NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/server-admin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

function getSupabaseAdmin() {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET() {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 500 }
    );
  }

  const limit = 100;
  const { data, error } = await supabase
    .from("mulligan_advice_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin/mulligan/runs] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, runs: data ?? [] });
}
