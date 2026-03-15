import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DECK_ANALYZER_SOURCE = "deck_analyzer_suggestion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      threadId,
      messageId,
      issueTypes,
      description,
      aiResponseText,
      userMessageText,
      source,
      deck_id,
      commander_name,
      suggestion_id,
      suggested_card_name,
      suggestion_category,
      suggestion_index,
      prompt_version_id,
    } = body;

    const isSuggestionReport = source === DECK_ANALYZER_SOURCE;
    const hasReasons = Array.isArray(issueTypes) && issueTypes.length > 0;
    const hasDescription = typeof description === "string" && description.trim().length > 0;

    if (isSuggestionReport) {
      if (!hasReasons && !hasDescription) {
        return NextResponse.json({ error: "Select at least one reason or add a description" }, { status: 400 });
      }
    } else {
      if (!hasReasons) {
        return NextResponse.json({ error: "At least one issue type is required" }, { status: 400 });
      }
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const issueTypesArr = hasReasons ? (issueTypes as string[]) : ["other"];
    const descriptionVal = typeof description === "string" ? description.trim().slice(0, 2000) : null;
    const aiText = isSuggestionReport
      ? (typeof suggested_card_name === "string" ? suggested_card_name : null) || aiResponseText
      : aiResponseText;
    const userText = isSuggestionReport ? descriptionVal : (userMessageText ?? descriptionVal);

    const contextJsonb = isSuggestionReport
      ? {
          source: DECK_ANALYZER_SOURCE,
          deck_id: deck_id ?? null,
          commander_name: commander_name ?? null,
          suggestion_id: suggestion_id ?? null,
          suggested_card_name: suggested_card_name ?? null,
          suggestion_category: suggestion_category ?? null,
          suggestion_index: suggestion_index ?? null,
          prompt_version_id: prompt_version_id ?? null,
        }
      : null;

    const row: Record<string, unknown> = {
      user_id: user?.id || null,
      thread_id: isSuggestionReport ? null : (threadId || null),
      message_id: isSuggestionReport ? null : (messageId || null),
      issue_types: issueTypesArr,
      description: descriptionVal,
      ai_response_text: aiText,
      user_message_text: userText,
      status: "pending",
    };
    if (contextJsonb !== null) row.context_jsonb = contextJsonb;

    const { error } = await supabase.from("ai_response_reports").insert(row);
    
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
