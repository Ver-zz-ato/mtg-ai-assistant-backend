import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(user: { id?: string; email?: string } | null): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

function hasCronAccess(req: NextRequest): boolean {
  const cronKey =
    process.env.CRON_KEY ||
    process.env.CRON_SECRET ||
    process.env.RENDER_CRON_SECRET ||
    "";
  if (!cronKey) return false;
  const url = new URL(req.url);
  const headerKey = req.headers.get("x-cron-key") || "";
  const queryKey = url.searchParams.get("key") || "";
  return headerKey === cronKey || queryKey === cronKey;
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (hasCronAccess(req)) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && isAdmin(user);
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const [totalRes, commanderRes, sampleRes, golosRes, configRes] = await Promise.all([
      admin.from("card_tag_cache").select("*", { count: "exact", head: true }),
      admin.from("card_tag_cache").select("*", { count: "exact", head: true }).eq("commander_eligible", true),
      admin
        .from("card_tag_cache")
        .select(
          "name, theme_tags, gameplay_tags, archetype_tags, commander_tags, commander_eligible, commander_power_band, commander_budget_band, commander_complexity, commander_interaction, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(10),
      admin.from("card_tag_cache").select("name").eq("name", "Golos, Tireless Pilgrim").maybeSingle(),
      admin
        .from("app_config")
        .select("key, value")
        .in("key", ["job:last:card-tag-refresh", "job:card-tag-refresh:detail", "job:last:card-tag-backfill"]),
    ]);

    const errorMessage =
      totalRes.error?.message ||
      commanderRes.error?.message ||
      sampleRes.error?.message ||
      golosRes.error?.message ||
      configRes.error?.message;

    if (errorMessage) {
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      totalRows: totalRes.count ?? 0,
      commanderEligibleRows: commanderRes.count ?? 0,
      golosPresentInTagCache: Boolean(golosRes.data),
      latestRows: sampleRes.data ?? [],
      jobConfig: configRes.data ?? [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
