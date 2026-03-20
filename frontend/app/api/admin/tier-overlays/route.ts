import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/lib/supa";
import { getTierOverlay, type TierOverlay } from "@/lib/ai/tier-overlays";

export const runtime = "nodejs";

function isAdmin(user: unknown): boolean {
  const u = user as { id?: string; email?: string } | null;
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(u?.id || "");
  const email = String(u?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

const TIER_KEYS: TierOverlay[] = ["guest", "free", "pro"];
const APP_CONFIG_PREFIX = "tier_overlay_";

async function getOverlayFromDb(db: ReturnType<typeof getAdmin>, tier: TierOverlay): Promise<string | null> {
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", `${APP_CONFIG_PREFIX}${tier}`)
    .maybeSingle();
  if (!data?.value || typeof data.value !== "object") return null;
  const body = (data.value as { body?: string }).body;
  return typeof body === "string" && body.trim() ? body.trim() : null;
}

/**
 * GET /api/admin/tier-overlays
 * Returns current overlay text for each tier (from app_config or hardcoded default).
 */
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const result: Record<TierOverlay, string> = { guest: "", free: "", pro: "" };
    for (const tier of TIER_KEYS) {
      const fromDb = await getOverlayFromDb(admin, tier);
      result[tier] = fromDb ?? getTierOverlay(tier);
    }
    return NextResponse.json({ ok: true, overlays: result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/tier-overlays
 * Body: { tier: "guest"|"free"|"pro", body: string }
 * Saves overlay to app_config. Empty body clears the override (will use hardcoded default).
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const tier = body?.tier;
    const overlayBody = typeof body?.body === "string" ? body.body.trim() : "";

    if (!tier || !TIER_KEYS.includes(tier)) {
      return NextResponse.json(
        { ok: false, error: "tier must be guest, free, or pro" },
        { status: 400 }
      );
    }

    const key = `${APP_CONFIG_PREFIX}${tier}`;
    if (overlayBody) {
      const { error } = await admin
        .from("app_config")
        .upsert({ key, value: { body: overlayBody } }, { onConflict: "key" });
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    } else {
      await admin.from("app_config").delete().eq("key", key);
    }

    return NextResponse.json({
      ok: true,
      message: overlayBody ? `Saved ${tier} overlay` : `Cleared ${tier} overlay (will use default)`,
      tier,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
