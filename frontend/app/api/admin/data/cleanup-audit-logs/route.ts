import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
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
    log("Starting audit log cleanup...");

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

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
    const tableName = body.table_name || 'admin_audit'; // 'admin_audit' or 'error_logs'
    const retentionDays = parseInt(body.retention_days || (tableName === 'admin_audit' ? '90' : '30'), 10);

    log(`Table: ${tableName}`);
    log(`Retention: ${retentionDays} days`);

    // Step 1: Preview
    log("Step 1: Previewing data to be deleted...");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString();

    const { count: countBefore, error: countError } = await admin
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDateStr);

    if (countError) {
      log(`ERROR: Failed to count rows: ${countError.message}`);
      throw new Error(`Count failed: ${countError.message}`);
    }

    const rowsToDelete = countBefore || 0;
    log(`Found ${rowsToDelete.toLocaleString()} rows to delete (older than ${cutoffDateStr})`);

    // Get date range
    const { data: oldestData } = await admin
      .from(tableName)
      .select('created_at')
      .lt('created_at', cutoffDateStr)
      .order('created_at', { ascending: true })
      .limit(1);

    const { data: newestData } = await admin
      .from(tableName)
      .select('created_at')
      .lt('created_at', cutoffDateStr)
      .order('created_at', { ascending: false })
      .limit(1);

    const oldestDate = oldestData?.[0]?.created_at || null;
    const newestToDelete = newestData?.[0]?.created_at || null;

    const { count: totalBefore } = await admin
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    const totalRowsBefore = totalBefore || 0;
    log(`Total rows in ${tableName} before cleanup: ${totalRowsBefore.toLocaleString()}`);

    if (rowsToDelete === 0) {
      log("No rows to delete - already clean!");
      return NextResponse.json({
        ok: true,
        table_name: tableName,
        deleted: 0,
        total_before: totalRowsBefore,
        total_after: totalRowsBefore,
        cutoff_date: cutoffDateStr,
        retention_days: retentionDays,
        message: "No rows older than cutoff date found",
        logs: logs
      });
    }

    // Step 2: Delete
    log("Step 2: Executing deletion...");
    const deleteStartTime = Date.now();
    const { error: deleteError, count: deletedCount } = await admin
      .from(tableName)
      .delete()
      .lt('created_at', cutoffDateStr);

    const deleteDuration = Date.now() - deleteStartTime;

    if (deleteError) {
      log(`ERROR: Deletion failed: ${deleteError.message}`);
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    const actualDeleted = deletedCount || 0;
    log(`✅ Deletion completed in ${deleteDuration}ms`);
    log(`Deleted ${actualDeleted.toLocaleString()} rows`);

    // Step 3: Verify
    const { count: totalAfter } = await admin
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    const totalRowsAfter = totalAfter || 0;
    log(`Total rows after cleanup: ${totalRowsAfter.toLocaleString()}`);

    const estimatedBytesFreed = actualDeleted * 200; // ~200 bytes per audit log row
    const estimatedMBFreed = Math.round((estimatedBytesFreed / 1024 / 1024) * 100) / 100;

    log("Cleanup complete!");
    log(`Estimated space freed: ~${estimatedMBFreed} MB`);

    // Log to admin_audit (if not cleaning admin_audit itself)
    if (tableName !== 'admin_audit') {
      try {
        await admin.from('admin_audit').insert({
          actor_id: user.id,
          action: 'cleanup_audit_logs',
          target: tableName,
          details: `Deleted ${actualDeleted} rows older than ${retentionDays} days`
        });
      } catch (auditError) {
        log(`WARNING: Failed to log to admin_audit: ${auditError}`);
      }
    }

    return NextResponse.json({
      ok: true,
      table_name: tableName,
      deleted: actualDeleted,
      total_before: totalRowsBefore,
      total_after: totalRowsAfter,
      cutoff_date: cutoffDateStr,
      retention_days: retentionDays,
      date_range_deleted: {
        oldest: oldestDate,
        newest: newestToDelete
      },
      estimated_space_freed_mb: estimatedMBFreed,
      delete_duration_ms: deleteDuration,
      logs: logs
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("Audit log cleanup error:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "cleanup_failed",
      logs: logs
    }, { status: 500 });
  }
}

