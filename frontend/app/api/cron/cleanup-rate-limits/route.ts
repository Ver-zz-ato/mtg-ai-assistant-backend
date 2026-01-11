import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute

/**
 * Cleanup old rate limit records
 * Runs weekly via Vercel cron to remove old api_usage_rate_limits records
 */
async function handleCleanup(req: NextRequest) {
  console.log("🧹 Rate limits cleanup started");
  
  try {
    // Authentication for cron job
    const cronKeyHeader = req.headers.get("x-cron-key") || "";
    const vercelId = req.headers.get("x-vercel-id"); // Vercel automatically adds this
    const url = new URL(req.url);
    const cronKeyQuery = url.searchParams.get("key") || "";
    const retentionDaysParam = url.searchParams.get("days") || "30";
    const retentionDays = parseInt(retentionDaysParam, 10) || 30;
    
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    
    // Allow if:
    // 1. Request has x-vercel-id (from Vercel cron) - trusted if coming from Vercel
    // 2. x-cron-key header matches CRON_KEY (for external/manual triggers)
    // 3. key query parameter matches CRON_KEY (alternative for manual triggers)
    const isFromVercel = !!vercelId;
    const hasValidHeader = cronKey && cronKeyHeader === cronKey;
    const hasValidQuery = cronKey && cronKeyQuery === cronKey;
    
    if (!isFromVercel && !hasValidHeader && !hasValidQuery) {
      console.log("❌ Unauthorized cleanup attempt", { 
        hasVercelId: !!vercelId,
        hasCronKeyHeader: !!cronKeyHeader,
        hasQueryKey: !!cronKeyQuery,
        cronKeySet: !!cronKey
      });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    // Call cleanup function (retention_days defaults to 30, but can be overridden via query param)
    const { data, error } = await admin.rpc('cleanup_old_rate_limits', {
      retention_days: retentionDays
    });

    if (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const deletedCount = result?.deleted_count || 0;

    console.log(`✅ Rate limits cleanup completed: ${deletedCount} old records removed (retention: ${retentionDays} days)`);
    
    return NextResponse.json({ 
      ok: true, 
      deleted: deletedCount,
      retention_days: retentionDays,
      cutoff_date: result?.cutoff_date,
      message: result?.message || "Rate limits cleanup completed"
    });

  } catch (error: any) {
    console.error("❌ Rate limits cleanup failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "cleanup_failed" 
    }, { status: 500 });
  }
}

// Vercel cron jobs use GET requests
export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

// Also support POST for manual triggers
export async function POST(req: NextRequest) {
  return handleCleanup(req);
}
