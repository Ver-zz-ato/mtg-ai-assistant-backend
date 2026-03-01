import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET(req: NextRequest) {
  // Verify cron authorization
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const isDev = process.env.NODE_ENV === "development";
  
  if (!isDev && cronKey && hdr !== cronKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const cutoffTime = Date.now() - RETENTION_MS;
  const cutoffISO = new Date(cutoffTime).toISOString();
  
  try {
    const supabase = await createClient();
    
    const { error, count } = await supabase
      .from('shoutbox_messages')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffISO);
    
    if (error) {
      console.error('[Shoutbox Cleanup] Delete error:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    
    console.log(`[Shoutbox Cleanup] Deleted ${count || 0} message(s) older than 48 hours`);
    
    return NextResponse.json({ 
      ok: true, 
      deleted: count || 0,
      cutoff: cutoffISO
    });
  } catch (e: any) {
    console.error('[Shoutbox Cleanup] Error:', e);
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
