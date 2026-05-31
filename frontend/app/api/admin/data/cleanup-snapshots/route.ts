import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { requireTypedConfirmation } from "@/lib/admin/danger-actions";
import {
  enforcePriceSnapshotRetention,
  PRICE_SNAPSHOT_RETENTION_DAYS,
} from "@/lib/server/priceSnapshotRetention";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large deletions

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}`;
    logs.push(logMsg);
    console.log(logMsg);
  };

  try {
    log("Starting price snapshot cleanup...");

    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      log("ERROR: Unauthorized access attempt");
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    log(`Admin user authenticated: ${user.email}`);

    const admin = getAdmin();
    if (!admin) {
      log("ERROR: Admin client not available");
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmation = requireTypedConfirmation(req, body, "DELETE");
    if (confirmation) return confirmation;

    const requestedRetentionDays = parseInt(body.days || String(PRICE_SNAPSHOT_RETENTION_DAYS), 10);
    const retentionDays = PRICE_SNAPSHOT_RETENTION_DAYS;
    if (requestedRetentionDays !== retentionDays) {
      log(`Requested retention ${requestedRetentionDays} days, enforcing fixed ${retentionDays}-day policy`);
    } else {
      log(`Retention period: ${retentionDays} days`);
    }

    log("Step 1: Determining cleanup scope...");
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
    log(`Cutoff date: ${cutoffDateStr} (anything older will be deleted)`);

    let totalRowsBefore = 0;
    try {
      const { count: totalBefore } = await admin
        .from("price_snapshots")
        .select("*", { count: "exact", head: true });
      totalRowsBefore = totalBefore || 0;
      log(`Total rows in price_snapshots before cleanup: ${totalRowsBefore.toLocaleString()}`);
    } catch (totalError: any) {
      log(`WARNING: Could not get total count (may timeout on large tables): ${totalError.message}`);
      log("Proceeding with deletion anyway - will verify after cleanup");
    }

    let oldestDateToDelete: string | null = null;
    try {
      const { data: oldestData } = await admin
        .from("price_snapshots")
        .select("snapshot_date")
        .lt("snapshot_date", cutoffDateStr)
        .order("snapshot_date", { ascending: true })
        .limit(1);
      if (oldestData && oldestData[0]) {
        oldestDateToDelete = String(oldestData[0].snapshot_date);
      }
    } catch (err: any) {
      log(`WARNING: Could not determine oldest date: ${err.message}`);
    }

    log(`Will delete all rows older than ${cutoffDateStr}`);
    if (oldestDateToDelete) {
      log(`Oldest date found: ${oldestDateToDelete}`);
    } else {
      log("No rows older than the cutoff were found.");
    }

    log("Step 2: Executing 60-day retention cleanup...");
    log("This may take several minutes for large tables...");

    const deleteStartTime = Date.now();
    const retentionResult = await enforcePriceSnapshotRetention(admin, (message) => log(message));
    const deleteDuration = Date.now() - deleteStartTime;
    const actualDeleted = retentionResult.rowsDeleted;

    log(`Cleanup completed in ${Math.round(deleteDuration / 1000)}s (${retentionResult.daysDeleted} days processed)`);
    log(`Deleted ${actualDeleted.toLocaleString()} rows`);

    log("Step 3: Verifying deletion...");
    const { count: totalAfter, error: afterError } = await admin
      .from("price_snapshots")
      .select("*", { count: "exact", head: true });

    if (afterError) {
      log(`WARNING: Could not verify total count: ${afterError.message}`);
    } else {
      const totalRowsAfter = totalAfter || 0;
      log(`Total rows in price_snapshots after cleanup: ${totalRowsAfter.toLocaleString()}`);
      log(`Rows removed: ${(totalRowsBefore - totalRowsAfter).toLocaleString()}`);

      const { count: remainingOld, error: remainingError } = await admin
        .from("price_snapshots")
        .select("*", { count: "exact", head: true })
        .lt("snapshot_date", cutoffDateStr);

      if (!remainingError) {
        const remainingOldCount = remainingOld || 0;
        if (remainingOldCount > 0) {
          log(`WARNING: ${remainingOldCount.toLocaleString()} rows older than cutoff still remain`);
        } else {
          log(`Verification passed: No rows older than ${cutoffDateStr} remain`);
        }
      }
    }

    const estimatedBytesFreed = actualDeleted * 50;
    const estimatedMBFreed = Math.round((estimatedBytesFreed / 1024 / 1024) * 100) / 100;

    log("Cleanup complete!");
    log(`Estimated space freed: ~${estimatedMBFreed} MB`);

    try {
      await admin.from("admin_audit").insert({
        actor_id: user.id,
        action: "cleanup_price_snapshots",
        target: "price_snapshots",
        details: `Deleted ${actualDeleted} rows older than ${cutoffDateStr} (${retentionDays} day retention, ${retentionResult.daysDeleted} days processed)`,
      });
    } catch (auditError) {
      log(`WARNING: Failed to log to admin_audit: ${auditError}`);
    }

    return NextResponse.json({
      ok: true,
      deleted: actualDeleted,
      total_before: totalRowsBefore,
      total_after: totalAfter || 0,
      cutoff_date: cutoffDateStr,
      retention_days: retentionDays,
      date_range_deleted: {
        oldest: retentionResult.oldestDeletedDate,
        newest: retentionResult.newestDeletedDate,
      },
      days_deleted: retentionResult.daysDeleted,
      rows_deleted: retentionResult.rowsDeleted,
      oldest_remaining_date: retentionResult.oldestRemainingDate,
      batches_processed: retentionResult.daysDeleted,
      estimated_space_freed_mb: estimatedMBFreed,
      delete_duration_ms: deleteDuration,
      logs,
    });
  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("Price snapshot cleanup error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "cleanup_failed",
        logs,
      },
      { status: 500 },
    );
  }
}
