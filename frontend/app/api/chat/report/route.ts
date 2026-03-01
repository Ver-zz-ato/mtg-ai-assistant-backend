import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { threadId, messageId, issueTypes, description, aiResponseText, userMessageText } = body;
    
    if (!Array.isArray(issueTypes) || issueTypes.length === 0) {
      return NextResponse.json({ error: "At least one issue type is required" }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // Get current user (optional - allow anonymous reports)
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from('ai_response_reports').insert({
      user_id: user?.id || null,
      thread_id: threadId || null,
      message_id: messageId || null,
      issue_types: issueTypes,
      description: description || null,
      ai_response_text: aiResponseText || null,
      user_message_text: userMessageText || null,
      status: 'pending'
    });
    
    if (error) {
      console.error('[Report API] Insert error:', error);
      // If table doesn't exist, return success anyway (non-critical feature)
      if (error.code === '42P01') {
        console.warn('[Report API] Table does not exist yet - migration pending');
        return NextResponse.json({ ok: true, warning: 'table_pending' });
      }
      return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Report API] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Check if user is admin (using ADMIN_EMAILS or similar)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!adminEmails.includes(user.email?.toLowerCase() || '')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    let query = supabase
      .from('ai_response_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    
    const { data, count, error } = await query;
    
    if (error) {
      console.error('[Report API] Fetch error:', error);
      return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
    }
    
    return NextResponse.json({ reports: data, total: count });
  } catch (e: any) {
    console.error('[Report API] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
