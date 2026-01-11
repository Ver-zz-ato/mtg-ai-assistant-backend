import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute

/**
 * Cleanup expired guest sessions
 * Runs daily via Vercel cron to remove old guest_session records
 */
async function handleCleanup(req: NextRequest) {
  console.log("🧹 Guest sessions cleanup started");
  
  try {
    // Authentication for cron job
    // Vercel cron jobs automatically add x-vercel-id header
    // For external/manual triggers, use x-cron-key header or CRON_KEY query param
    const cronKeyHeader = req.headers.get("x-cron-key") || "";
    const vercelId = req.headers.get("x-vercel-id"); // Vercel automatically adds this
    const url = new URL(req.url);
    const cronKeyQuery = url.searchParams.get("key") || "";
    
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

    // Delete guest sessions that have expired (expires_at < NOW())
    const { count, error } = await admin
      .from('guest_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    console.log(`✅ Guest sessions cleanup completed: ${count || 0} expired sessions removed`);
    
    return NextResponse.json({ 
      ok: true, 
      cleaned: count || 0,
      message: "Guest sessions cleanup completed"
    });

  } catch (error: any) {
    console.error("❌ Guest sessions cleanup failed:", error);
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
