import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
  
  return adminEmails.includes(user.email?.toLowerCase() || '') || adminUserIds.includes(user.id);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const { data, error } = await supabase
      .from('banned_shoutbox_users')
      .select('*')
      .order('banned_at', { ascending: false });
    
    if (error) {
      console.error('[Admin Shoutbox Ban] Fetch error:', error);
      return NextResponse.json({ error: "Failed to fetch banned users" }, { status: 500 });
    }
    
    return NextResponse.json({ banned: data });
  } catch (e: any) {
    console.error('[Admin Shoutbox Ban] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    const body = await req.json();
    const { userName, reason } = body;
    
    if (!userName || typeof userName !== 'string') {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    
    const { error } = await supabase
      .from('banned_shoutbox_users')
      .insert({
        user_name: userName.trim(),
        banned_by: user?.email || 'admin',
        reason: reason || null
      });
    
    if (error) {
      // Handle duplicate
      if (error.code === '23505') {
        return NextResponse.json({ error: "User already banned" }, { status: 400 });
      }
      console.error('[Admin Shoutbox Ban] Insert error:', error);
      return NextResponse.json({ error: "Failed to ban user" }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Shoutbox Ban] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const body = await req.json();
    const { userName } = body;
    
    if (!userName || typeof userName !== 'string') {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    
    const { error } = await supabase
      .from('banned_shoutbox_users')
      .delete()
      .eq('user_name', userName);
    
    if (error) {
      console.error('[Admin Shoutbox Ban] Delete error:', error);
      return NextResponse.json({ error: "Failed to unban user" }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Shoutbox Ban] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
