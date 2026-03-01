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
      console.error('[Admin Reports] Fetch error:', error);
      return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
    }
    
    return NextResponse.json({ reports: data, total: count });
  } catch (e: any) {
    console.error('[Admin Reports] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    const body = await req.json();
    const { reportId, status, adminNotes, correctedResponse } = body;
    
    if (!reportId) {
      return NextResponse.json({ error: "Report ID required" }, { status: 400 });
    }
    
    // Update the report
    const { error: updateError } = await supabase
      .from('ai_response_reports')
      .update({
        status: status || undefined,
        admin_notes: adminNotes !== undefined ? adminNotes : undefined,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id || null,
      })
      .eq('id', reportId);
    
    if (updateError) {
      console.error('[Admin Reports] Update error:', updateError);
      return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
    }
    
    // If corrected response provided, save to ai_human_reviews for training
    if (correctedResponse?.trim() && status === 'resolved') {
      // Get the original report to include context
      const { data: report } = await supabase
        .from('ai_response_reports')
        .select('*')
        .eq('id', reportId)
        .single();
      
      if (report) {
        const { error: reviewError } = await supabase.from('ai_human_reviews').insert({
          source: 'user_report',
          route: '/api/chat',
          input: {
            user_message: report.user_message_text,
            thread_id: report.thread_id,
            report_id: report.id,
            issue_types: report.issue_types,
          },
          output: report.ai_response_text,
          labels: {
            issues: report.issue_types,
            corrected: true,
          },
          reviewer: user?.email || 'admin',
          status: 'reviewed',
          meta: {
            corrected_response: correctedResponse,
            original_response: report.ai_response_text,
          },
        });
        
        if (reviewError) {
          console.warn('[Admin Reports] Failed to save corrected response:', reviewError);
        }
      }
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin Reports] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
