import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/lib/supa";
import {
  appConfigKeyForTierOverlay,
  getTierOverlay,
  type TierOverlay,
} from "@/lib/ai/tier-overlays";

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

/** Legacy key — delete on clear so old rows do not shadow defaults. */
function legacyOverlayKey(tier: TierOverlay): string {
  return `tier_overlay_${tier}`;
}

async function getOverlayFromDb(db: ReturnType<typeof getAdmin>, tier: TierOverlay): Promise<string | null> {
  for (const key of [appConfigKeyForTierOverlay(tier), legacyOverlayKey(tier)]) {
    const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
    if (!data?.value || typeof data.value !== "object") continue;
    const body = (data.value as { body?: string }).body;
    if (typeof body === "string" && body.trim()) return body.trim();
  }
  return null;
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

    const key = appConfigKeyForTierOverlay(tier);
    const now = new Date().toISOString();
    if (overlayBody) {
      const { data: row, error } = await admin
        .from("app_config")
        .upsert(
          { key, value: { body: overlayBody }, updated_at: now },
          { onConflict: "key" }
        )
        .select("key, value, updated_at")
        .maybeSingle();
      if (error) {
        console.error("[admin/tier-overlays] upsert failed", { key, code: error.code, message: error.message });
        return NextResponse.json(
          { ok: false, error: error.message || "upsert_failed", details: { code: error.code, key } },
          { status: 500 }
        );
      }
      // Drop legacy key so DB does not keep two rows for the same tier
      await admin.from("app_config").delete().eq("key", legacyOverlayKey(tier));
      return NextResponse.json({
        ok: true,
        message: `Saved ${tier} overlay`,
        tier,
        key: row?.key ?? key,
        updated_at: (row as { updated_at?: string })?.updated_at ?? now,
      });
    }
    const { error: delErr } = await admin.from("app_config").delete().in("key", [key, legacyOverlayKey(tier)]);
    if (delErr) {
      console.error("[admin/tier-overlays] delete failed", delErr);
      return NextResponse.json(
        { ok: false, error: delErr.message || "delete_failed", details: { key } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Cleared ${tier} overlay (will use default)`,
      tier,
      key,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
