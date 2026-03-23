import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdminUser } from "@/lib/admin-auth";
import { validateOrigin } from "@/lib/api/csrf";
import { parseTierLimitsJson } from "@/lib/mobile/validation";

export const runtime = "nodejs";

const TIER_KEY = "mobile.tiers.limits";

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const { data, error } = await admin
      .from("remote_config")
      .select("key, description, value, platform, updated_at, updated_by")
      .eq("key", TIER_KEY)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, row: data ?? null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "Invalid origin. This request must come from the same site." },
        { status: 403 }
      );
    }

    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.valueJson === "string" ? body.valueJson : JSON.stringify(body?.value ?? {});
    const parsed = parseTierLimitsJson(raw);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const row = {
      key: TIER_KEY,
      description: "Guest / free / pro numeric limits (-1 = unlimited)",
      value: parsed.value,
      platform: "all",
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    const { error } = await admin.from("remote_config").upsert(row, { onConflict: "key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    try {
      await admin.from("admin_audit").insert({
        actor_id: user.id,
        action: "mobile_tier_limits_update",
        target: TIER_KEY,
        payload: { tiers: Object.keys(parsed.value) },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, key: TIER_KEY });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
