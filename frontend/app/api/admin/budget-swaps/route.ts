import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import fs from 'fs';
import path from 'path';

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const swapsFilePath = path.join(process.cwd(), 'frontend', 'lib', 'data', 'budget-swaps.json');
    
    try {
      const fileContent = fs.readFileSync(swapsFilePath, 'utf-8');
      const data = JSON.parse(fileContent);
      return NextResponse.json({ ok: true, swaps: data.swaps || {}, version: data.version, lastUpdated: data.lastUpdated });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Failed to read swaps file: ${e.message}` }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { swaps } = body;

    if (!swaps || typeof swaps !== 'object') {
      return NextResponse.json({ ok: false, error: "swaps object required" }, { status: 400 });
    }

    const swapsFilePath = path.join(process.cwd(), 'frontend', 'lib', 'data', 'budget-swaps.json');
    
    // Read existing file to preserve version and metadata
    let existingData: any = { version: "1.0.0", lastUpdated: new Date().toISOString().split('T')[0], swaps: {} };
    try {
      const fileContent = fs.readFileSync(swapsFilePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    } catch {
      // File doesn't exist, use defaults
    }

    // Update swaps and metadata
    existingData.swaps = swaps;
    existingData.lastUpdated = new Date().toISOString().split('T')[0];
    if (!existingData.version) existingData.version = "1.0.0";

    try {
      fs.writeFileSync(swapsFilePath, JSON.stringify(existingData, null, 2), 'utf-8');
      
      // Log to admin audit if available
      try {
        const { getAdmin } = await import('@/app/api/_lib/supa');
        const admin = getAdmin();
        if (admin) {
          try {
            await admin.from('admin_audit').insert({
              actor_id: user.id,
              action: 'budget_swaps_update',
              target: 'budget-swaps.json',
              details: `Updated ${Object.keys(swaps).length} budget swap entries`
            });
          } catch {
            // Ignore audit errors
          }
        }
      } catch {
        // Ignore if audit system unavailable
      }

      return NextResponse.json({ 
        ok: true, 
        message: "Budget swaps updated successfully",
        count: Object.keys(swaps).length 
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Failed to write swaps file: ${e.message}` }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "server_error" }, { status: 500 });
  }
}
