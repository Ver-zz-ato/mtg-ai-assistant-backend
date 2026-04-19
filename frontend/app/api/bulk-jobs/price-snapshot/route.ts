import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { runPriceSnapshotFromScryfallBulk } from "@/lib/server/priceSnapshotFromScryfallBulk";
import { getAdmin } from "@/app/api/_lib/supa";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import type { AdminJobDetail } from "@/lib/admin/adminJobDetail";

const JOB_ID = "price_snapshot_bulk";

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
  const attemptStartedAt = new Date().toISOString();
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

    const admin = getAdmin();
    if (admin) await markAdminJobAttempt(admin, JOB_ID);

    const result = await runPriceSnapshotFromScryfallBulk(supabase);

    console.log("📝 Recording job completion timestamp...");
    try {
      const admin2 = getAdmin();
      if (admin2) {
        const actor = user?.id || (hdr && cronKey && hdr === cronKey ? "cron" : null);
        await admin2.from("admin_audit").insert({ actor_id: actor, action: "price_snapshot_bulk", target: result.snapshot_date });
      }
    } catch (e) {
      console.warn("⚠️ Could not record audit log:", e);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const durationMs = Date.now() - startTime;
    const finishedAt = new Date().toISOString();
    const detail: AdminJobDetail = {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: "success",
      compactLine: `Snapshot ${result.snapshot_date}: ${result.inserted.toLocaleString()} rows (USD/EUR/GBP) · ${result.unique_cards.toLocaleString()} unique names · ${duration}s`,
      destination: "price_snapshots",
      source: "Scryfall default_cards bulk → median USD/EUR + GBP via FX",
      durationMs,
      counts: {
        snapshot_rows: result.inserted,
        unique_card_names: result.unique_cards,
      },
      labels: {
        mode: "local_bulk_jobs",
        endpoint: "POST /api/bulk-jobs/price-snapshot",
        note: "Independent of price_cache — Job 3 can run without Job 2",
      },
    };
    const adminPersist = getAdmin();
    if (adminPersist) await persistAdminJobRun(adminPersist, JOB_ID, detail);

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
    try {
      const admin = getAdmin();
      if (admin) {
        await persistAdminJobRun(admin, JOB_ID, {
          jobId: JOB_ID,
          attemptStartedAt,
          finishedAt: new Date().toISOString(),
          ok: false,
          runResult: "failed",
          compactLine: `Failed: ${String(e?.message || "server_error").slice(0, 200)}`,
          destination: "price_snapshots",
          lastError: String(e?.message || "server_error"),
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
