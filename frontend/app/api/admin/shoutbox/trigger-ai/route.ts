import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
  
  return adminEmails.includes(user.email?.toLowerCase() || '') || adminUserIds.includes(user.id);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    // Call the auto-generate endpoint with force flag
    const url = new URL('/api/shout/auto-generate', req.nextUrl.origin);
    url.searchParams.set('force', 'true');
    
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[Admin Shoutbox Trigger] Failed:', text);
      return NextResponse.json({ error: "Failed to trigger AI generation" }, { status: 500 });
    }
    
    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    console.error('[Admin Shoutbox Trigger] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
