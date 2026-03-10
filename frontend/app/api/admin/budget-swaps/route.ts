import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { getBudgetSwaps, BUNDLED } from "@/lib/data/get-budget-swaps";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/** Convert map to the format expected by the API (preserve original keys) */
function toApiSwaps(map: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(map)) {
    out[key] = values;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const swaps = await getBudgetSwaps();
    const admin = getAdmin();
    let lastUpdated: string | null = null;
    let version = "1.0.0";

    if (admin) {
      const { data } = await admin.from('app_config').select('value').eq('key', 'budget_swaps').maybeSingle();
      const val = data?.value as { lastUpdated?: string; version?: string } | null;
      if (val) {
        lastUpdated = val.lastUpdated ?? null;
        version = val.version ?? "1.0.0";
      }
    }

    if (!lastUpdated && Object.keys(swaps).length === Object.keys(BUNDLED).length) {
      lastUpdated = "2026-01-20";
    }

    return NextResponse.json({
      ok: true,
      swaps: toApiSwaps(swaps),
      version,
      lastUpdated: lastUpdated || new Date().toISOString().split('T')[0],
      source: admin ? 'app_config' : 'bundled',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { swaps } = body;

    if (!swaps || typeof swaps !== 'object') {
      return NextResponse.json({ ok: false, error: "swaps object required" }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const lastUpdated = new Date().toISOString().split('T')[0];
    const payload = { swaps, lastUpdated, version: "1.0.0" };

    const { error } = await admin
      .from('app_config')
      .upsert({
        key: 'budget_swaps',
        value: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'budget_swaps_update',
        target: 'app_config.budget_swaps',
        details: `Updated ${Object.keys(swaps).length} budget swap entries`,
      });
    } catch {
      // Ignore audit errors
    }

    return NextResponse.json({
      ok: true,
      message: "Budget swaps updated successfully",
      count: Object.keys(swaps).length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "server_error" }, { status: 500 });
  }
}
