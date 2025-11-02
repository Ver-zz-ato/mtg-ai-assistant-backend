import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large deletions

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
    log("Starting price snapshot cleanup...");

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

    // Get days parameter from request body (default 60)
    const body = await req.json().catch(() => ({}));
    const retentionDays = parseInt(body.days || "60", 10);
    log(`Retention period: ${retentionDays} days`);

    // Step 1: Preview - Skip count query to avoid timeout on large tables
    log("Step 1: Determining cleanup scope...");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD format

    log(`Cutoff date: ${cutoffDateStr} (anything older will be deleted)`);

    // Get total count before deletion (this might be slow but we need it for comparison)
    let totalRowsBefore = 0;
    try {
      const { count: totalBefore } = await admin
        .from('price_snapshots')
        .select('*', { count: 'exact', head: true });
      totalRowsBefore = totalBefore || 0;
      log(`Total rows in price_snapshots before cleanup: ${totalRowsBefore.toLocaleString()}`);
    } catch (totalError: any) {
      log(`WARNING: Could not get total count (may timeout on large tables): ${totalError.message}`);
      log("Proceeding with deletion anyway - will verify after cleanup");
    }

    // Try to get the oldest date that will be deleted (quick query with limit)
    let oldestDate = cutoffDateStr; // Default to cutoff date
    try {
      const { data: oldestData } = await admin
        .from('price_snapshots')
        .select('snapshot_date')
        .lt('snapshot_date', cutoffDateStr)
        .order('snapshot_date', { ascending: true })
        .limit(1);
      if (oldestData && oldestData[0]) {
        oldestDate = oldestData[0].snapshot_date;
      }
    } catch (err: any) {
      log(`WARNING: Could not determine oldest date: ${err.message}`);
    }

    log(`Will delete all rows older than ${cutoffDateStr}`);
    if (oldestDate !== cutoffDateStr) {
      log(`Oldest date found: ${oldestDate}`);
    }

    // Skip count query - it times out on large tables. We'll delete by date and track as we go.

    // Step 2: Execute deletion in batches to avoid timeouts
    // Supabase doesn't support .limit() on delete, so we'll delete by date ranges
    log("Step 2: Executing deletion in batches (by date)...");
    log(`This may take several minutes for large tables...`);

    const deleteStartTime = Date.now();
    let totalDeleted = 0;
    let batchNumber = 0;
    
    // Delete by iterating through date ranges (one day at a time)
    // Start from the oldest date and work forward to cutoff date
    const startDate = new Date(oldestDate);
    const endDate = new Date(cutoffDateStr);
    const currentDate = new Date(startDate);
    
    // Process one day at a time to avoid timeouts
    log(`Processing dates from ${oldestDate} to ${cutoffDateStr}...`);
    
    while (currentDate < endDate) {
      const batchDateStr = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD
      
      // For each date, we need to delete in smaller chunks because a single date can have 30k+ rows
      // We'll use the name_norm field to create smaller batches (process by first letter ranges)
      log(`  Processing ${batchDateStr} in smaller chunks...`);
      
      // Get distinct name_norm prefixes to chunk the deletion
      // Use first character of name_norm to create ~26 batches per date (A-Z)
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let chunksProcessed = 0;
      
      for (const char of alphabet) {
        batchNumber++;
        chunksProcessed++;
        
        try {
          // Delete rows for this date where name_norm starts with this character
          // This creates ~36 smaller batches (26 letters + 10 digits) per date
          const { error: batchError, count: batchDeleted } = await admin
            .from('price_snapshots')
            .delete()
            .eq('snapshot_date', batchDateStr)
            .like('name_norm', `${char}%`);

          if (batchError) {
            // If this chunk fails due to timeout or other error, log and continue
            log(`    Chunk ${chunksProcessed} (${char}*): ${batchError.message}`);
            // Continue with next chunk
          } else {
            const batchDeletedCount = batchDeleted || 0;
            if (batchDeletedCount > 0) {
              totalDeleted += batchDeletedCount;
              log(`    Chunk ${chunksProcessed} (${char}*): Deleted ${batchDeletedCount.toLocaleString()} rows (Total: ${totalDeleted.toLocaleString()})`);
            }
          }
          
          // Small delay between chunks
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
        } catch (err: any) {
          log(`    Chunk ${chunksProcessed} (${char}*): Error - ${err.message} - continuing...`);
        }
      }
      
      // Handle NULL name_norm separately
      batchNumber++;
      try {
        const { error: batchError, count: batchDeleted } = await admin
          .from('price_snapshots')
          .delete()
          .eq('snapshot_date', batchDateStr)
          .is('name_norm', null);

        if (!batchError && batchDeleted && batchDeleted > 0) {
          totalDeleted += batchDeleted;
          log(`    Chunk (NULL names): Deleted ${batchDeleted.toLocaleString()} rows (Total: ${totalDeleted.toLocaleString()})`);
        }
      } catch (err: any) {
        // Ignore errors
      }
      
      log(`  Date ${batchDateStr} complete (${chunksProcessed} chunks processed)`);

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const deleteDuration = Date.now() - deleteStartTime;
    const actualDeleted = totalDeleted;
    log(`✅ Deletion completed in ${Math.round(deleteDuration / 1000)}s (${batchNumber} batches)`);
    log(`Deleted ${actualDeleted.toLocaleString()} rows`);

    // Step 3: Verify deletion
    log("Step 3: Verifying deletion...");
    const { count: totalAfter, error: afterError } = await admin
      .from('price_snapshots')
      .select('*', { count: 'exact', head: true });

    if (afterError) {
      log(`WARNING: Could not verify total count: ${afterError.message}`);
    } else {
      const totalRowsAfter = totalAfter || 0;
      log(`Total rows in price_snapshots after cleanup: ${totalRowsAfter.toLocaleString()}`);
      log(`Rows removed: ${(totalRowsBefore - totalRowsAfter).toLocaleString()}`);

      // Verify no rows older than cutoff remain
      const { count: remainingOld, error: remainingError } = await admin
        .from('price_snapshots')
        .select('*', { count: 'exact', head: true })
        .lt('snapshot_date', cutoffDateStr);

      if (!remainingError) {
        const remainingOldCount = remainingOld || 0;
        if (remainingOldCount > 0) {
          log(`WARNING: ${remainingOldCount.toLocaleString()} rows older than cutoff still remain`);
        } else {
          log(`✅ Verification passed: No rows older than ${cutoffDateStr} remain`);
        }
      }
    }

    // Estimate space freed (rough estimate: ~50 bytes per row for price_snapshots)
    const estimatedBytesFreed = actualDeleted * 50;
    const estimatedMBFreed = Math.round((estimatedBytesFreed / 1024 / 1024) * 100) / 100;

    log("Cleanup complete!");
    log(`Estimated space freed: ~${estimatedMBFreed} MB`);

    // Log to admin_audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'cleanup_price_snapshots',
        target: `price_snapshots`,
        details: `Deleted ${actualDeleted} rows older than ${cutoffDateStr} (${retentionDays} day retention)`
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
        oldest: oldestDate,
        newest: cutoffDateStr
      },
      batches_processed: batchNumber,
      estimated_space_freed_mb: estimatedMBFreed,
      delete_duration_ms: deleteDuration,
      logs: logs
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("Price snapshot cleanup error:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "cleanup_failed",
      logs: logs
    }, { status: 500 });
  }
}

