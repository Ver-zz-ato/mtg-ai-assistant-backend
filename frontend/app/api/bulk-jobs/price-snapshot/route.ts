import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { runPriceSnapshotFromScryfallBulk } from "@/lib/server/priceSnapshotFromScryfallBulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes for large bulk operations

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(_req: NextRequest) {
  const startTime = Date.now();
  try {
    console.log("🚀 Starting bulk price snapshot job...");
    let supabase: any = await createClient();
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = _req.headers.get("x-cron-key") || "";
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;

    if (!user && cronKey && hdr === cronKey && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      supabase = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
    } else if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized - no user" }, { status: 401 });
    } else if (user && !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden - admin required" }, { status: 403 });
    }

    const result = await runPriceSnapshotFromScryfallBulk(supabase);

    console.log("📝 Recording job completion timestamp...");
    try {
      const { getAdmin } = await import("@/app/api/_lib/supa");
      const admin = getAdmin();
      if (admin) {
        await admin.from("app_config").upsert(
          { key: "job:last:price_snapshot_bulk", value: new Date().toISOString() },
          { onConflict: "key" }
        );
        const actor = user?.id || (hdr && cronKey && hdr === cronKey ? "cron" : null);
        await admin.from("admin_audit").insert({ actor_id: actor, action: "price_snapshot_bulk", target: result.snapshot_date });
      }
    } catch (e) {
      console.warn("⚠️ Could not record audit log:", e);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`🎉 Price snapshot job completed successfully in ${duration} seconds!`);
    console.log(`   • Unique cards: ${result.unique_cards}`);
    console.log(`   • Total snapshots: ${result.inserted} (USD+EUR+GBP)`);
    console.log(`   • Snapshot date: ${result.snapshot_date}`);

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      snapshot_date: result.snapshot_date,
      mode: "bulk",
      unique_cards: result.unique_cards,
      duration_seconds: duration,
    });
  } catch (e: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`❌ Price snapshot job failed after ${duration} seconds:`, e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
