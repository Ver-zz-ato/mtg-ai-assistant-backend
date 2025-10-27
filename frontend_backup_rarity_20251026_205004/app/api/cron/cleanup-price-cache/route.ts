import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute

export async function POST(req: NextRequest) {
  console.log("🧹 Price cache cleanup started");
  
  try {
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    
    if (!cronKey || hdr !== cronKey) {
      console.log("❌ Unauthorized cleanup attempt");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    // Delete price cache entries older than 48 hours (keeps 24-hour cache + buffer)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { count, error } = await admin
      .from('price_cache')
      .delete()
      .lt('updated_at', cutoff);

    if (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    console.log(`✅ Price cache cleanup completed: ${count || 0} old entries removed`);
    
    return NextResponse.json({ 
      ok: true, 
      cleaned: count || 0,
      cutoff_time: cutoff,
      message: "Price cache cleanup completed"
    });

  } catch (error: any) {
    console.error("❌ Price cache cleanup failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "cleanup_failed" 
    }, { status: 500 });
  }
}