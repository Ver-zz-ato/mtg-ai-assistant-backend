import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runPriceSnapshotFromScryfallBulk } from "@/lib/server/priceSnapshotFromScryfallBulk";
import { getAdmin } from "@/app/api/_lib/supa";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import type { AdminJobDetail } from "@/lib/admin/adminJobDetail";

const JOB_ID = "price_snapshot_bulk";

export const runtime = "nodejs";
export const maxDuration = 600; // match bulk download + upsert (was 300; bulk needs more time)

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

function getCronKey(): string {
  return process.env.CRON_KEY || process.env.CRON_SECRET || process.env.RENDER_CRON_SECRET || "";
}

function getBulkJobsBaseUrl(): string {
  return (
    process.env.BULK_JOBS_URL ||
    process.env.BULK_JOBS_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
}

async function triggerExternalBulkSnapshot(cronKey: string): Promise<{ delegated: true; url: string } | null> {
  const base = getBulkJobsBaseUrl();
  if (!base) return null;
  try {
    const endpoint = `${base}/price-snapshot`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-cron-key": cronKey,
        "Content-Type": "application/json",
      },
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`external_snapshot_failed:${res.status}:${body.slice(0, 300)}`);
    }
    return { delegated: true, url: endpoint };
  } catch (e) {
    console.warn("[cron/price/snapshot] external delegation failed, falling back to in-process run", e);
    return null;
  }
}

async function runSnapshot(req: NextRequest) {
  const attemptStartedAt = new Date().toISOString();
  try {
    const isVercelCron = !!req.headers.get("x-vercel-cron");
    const key = req.nextUrl.searchParams.get("key") || "";
    const cronKey = getCronKey();
    if (!(isVercelCron || (cronKey && key && key === cronKey))) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Preferred production path: hand off to the long-running bulk-jobs server.
    const delegated = await triggerExternalBulkSnapshot(cronKey);
    if (delegated) {
      const admin = getAdmin();
      if (admin) {
        await markAdminJobAttempt(admin, JOB_ID);
        await persistAdminJobRun(
          admin,
          JOB_ID,
          {
            jobId: JOB_ID,
            attemptStartedAt,
            finishedAt: new Date().toISOString(),
            ok: true,
            runResult: "delegated",
            compactLine: `Delegated to bulk worker (${delegated.url}) — ${getBulkJobsBaseUrl() || "BULK_JOBS_URL"}; row counts appear when the worker completes`,
            destination: "price_snapshots (via worker)",
            labels: {
              mode: "delegated",
              worker_url: getBulkJobsBaseUrl() || "",
            },
          },
          { updateLastSuccess: false }
        );
      }
      return NextResponse.json({ ok: true, mode: "delegated", ...delegated });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !sr) return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });
    const supabase = createAdmin(url, sr, { auth: { persistSession: false } });

    const admin = getAdmin();
    if (admin) await markAdminJobAttempt(admin, JOB_ID);

    const result = await runPriceSnapshotFromScryfallBulk(supabase);

    try {
      await supabase.from("admin_audit").insert({ actor_id: "cron", action: "cron_price_snapshot", target: result.snapshot_date });
    } catch {
      /* ignore */
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(attemptStartedAt).getTime();
    const detail: AdminJobDetail = {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: "success",
      compactLine: `Snapshot ${result.snapshot_date}: ${result.inserted.toLocaleString()} rows · ${result.unique_cards.toLocaleString()} names (in-process bulk)`,
      destination: "price_snapshots",
      source: "Scryfall default_cards bulk",
      durationMs,
      counts: { snapshot_rows: result.inserted, unique_card_names: result.unique_cards },
      labels: { mode: "bulk", route: "GET/POST /api/cron/price/snapshot" },
    };
    if (admin) await persistAdminJobRun(admin, JOB_ID, detail);

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      snapshot_date: result.snapshot_date,
      mode: "bulk",
      unique_cards: result.unique_cards,
    });
  } catch (e: any) {
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
          lastError: String(e?.message || "server_error"),
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runSnapshot(req);
}

export async function POST(req: NextRequest) {
  console.log("📈 Price snapshot endpoint called");
  const attemptStartedAt = new Date().toISOString();

  try {
    const cronKey = getCronKey();
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          console.log("✅ Admin user auth successful");
        }
      } catch (authError: any) {
        console.log("❌ User auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      console.log("❌ Authorization failed");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Preferred production path: hand off to the long-running bulk-jobs server.
    const delegated = await triggerExternalBulkSnapshot(cronKey);
    if (delegated) {
      const admin = getAdmin();
      if (admin) {
        await markAdminJobAttempt(admin, JOB_ID);
        await persistAdminJobRun(
          admin,
          JOB_ID,
          {
            jobId: JOB_ID,
            attemptStartedAt,
            finishedAt: new Date().toISOString(),
            ok: true,
            runResult: "delegated",
            compactLine: `Delegated to ${delegated.url} — check worker + job:last:price_snapshot_bulk when done`,
            destination: "price_snapshots (via worker)",
            labels: { mode: "delegated" },
          },
          { updateLastSuccess: false }
        );
      }
      return NextResponse.json({ ok: true, mode: "delegated", ...delegated });
    }

    console.log("🚀 Authorization successful, starting price snapshot (Scryfall bulk)...");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !sr) {
      return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });
    }
    const supabase = createAdmin(url, sr, { auth: { persistSession: false } });

    const admin = getAdmin();
    if (admin) await markAdminJobAttempt(admin, JOB_ID);

    const result = await runPriceSnapshotFromScryfallBulk(supabase);

    try {
      await supabase.from("admin_audit").insert({ actor_id: "cron", action: "cron_price_snapshot", target: result.snapshot_date });
    } catch {
      /* ignore */
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(attemptStartedAt).getTime();
    const detail: AdminJobDetail = {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: "success",
      compactLine: `Snapshot ${result.snapshot_date}: ${result.inserted.toLocaleString()} rows · ${result.unique_cards.toLocaleString()} names`,
      destination: "price_snapshots",
      source: "Scryfall default_cards bulk",
      durationMs,
      counts: { snapshot_rows: result.inserted, unique_card_names: result.unique_cards },
      labels: { mode: "bulk", auth: "cron key or admin user" },
    };
    if (admin) await persistAdminJobRun(admin, JOB_ID, detail);

    console.log(`✅ Price snapshot completed: ${result.inserted} rows, ${result.unique_cards} unique names`);

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      snapshot_date: result.snapshot_date,
      mode: "bulk",
      unique_cards: result.unique_cards,
    });
  } catch (error: any) {
    console.error("❌ Price snapshot failed:", error);
    try {
      const admin = getAdmin();
      if (admin) {
        await persistAdminJobRun(admin, JOB_ID, {
          jobId: JOB_ID,
          attemptStartedAt,
          finishedAt: new Date().toISOString(),
          ok: false,
          runResult: "failed",
          compactLine: `Failed: ${String(error?.message || "snapshot_failed").slice(0, 200)}`,
          lastError: String(error?.message || "snapshot_failed"),
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "snapshot_failed",
      },
      { status: 500 }
    );
  }
}
