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
    
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const aiOnly = url.searchParams.get('ai_only') === 'true';
    
    let query = supabase
      .from('shoutbox_messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (aiOnly) {
      query = query.eq('is_ai_generated', true);
    }
    
    const { data, count, error } = await query;
    
    if (error) {
      console.error('[Admin Shoutbox] Fetch error:', error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }
    
    // Get stats
    const { count: totalCount } = await supabase
      .from('shoutbox_messages')
      .select('*', { count: 'exact', head: true });
    
    const { count: aiCount } = await supabase
      .from('shoutbox_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_ai_generated', true);
    
    const { count: bannedCount } = await supabase
      .from('banned_shoutbox_users')
      .select('*', { count: 'exact', head: true });
    
    return NextResponse.json({ 
      messages: data, 
      total: count,
      stats: {
        total: totalCount || 0,
        ai: aiCount || 0,
        real: (totalCount || 0) - (aiCount || 0),
        banned: bannedCount || 0
      }
    });
  } catch (e: any) {
    console.error('[Admin Shoutbox] Error:', e);
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
    const { ids } = body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "IDs array required" }, { status: 400 });
    }
    
    const { error } = await supabase
      .from('shoutbox_messages')
      .delete()
      .in('id', ids);
    
    if (error) {
      console.error('[Admin Shoutbox] Delete error:', error);
      return NextResponse.json({ error: "Failed to delete messages" }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (e: any) {
    console.error('[Admin Shoutbox] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
