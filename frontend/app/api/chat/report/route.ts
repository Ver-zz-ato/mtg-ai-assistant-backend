import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";

const DECK_ANALYZER_SOURCE = "deck_analyzer_suggestion";
const CHAT_CORRECTION_SOURCE = "chat_correction";

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
      correction_text,
      better_cards_text,
      format,
      page_path,
      chat_surface,
    } = body;

    const isSuggestionReport = source === DECK_ANALYZER_SOURCE;
    const isChatCorrection = source === CHAT_CORRECTION_SOURCE;
    const hasReasons = Array.isArray(issueTypes) && issueTypes.length > 0;
    const hasDescription = typeof description === "string" && description.trim().length > 0;
    const hasCorrectionText = typeof correction_text === "string" && correction_text.trim().length > 0;
    const hasBetterCards = typeof better_cards_text === "string" && better_cards_text.trim().length > 0;

    const chatSurfaceRaw = typeof chat_surface === "string" ? chat_surface.trim() : "";
    const isAppChatSurface = chatSurfaceRaw.startsWith("app_");

    if (isSuggestionReport) {
      if (!hasReasons && !hasDescription) {
        return NextResponse.json({ error: "Select at least one reason or add a description" }, { status: 400 });
      }
    } else if (isChatCorrection) {
      if (!hasReasons && !hasDescription && !hasCorrectionText && !hasBetterCards) {
        return NextResponse.json({ error: "Add at least one reason, what it should have said, or better cards" }, { status: 400 });
      }
    } else {
      if (isAppChatSurface && !hasDescription) {
        return NextResponse.json(
          { error: "Please add a short description of the issue" },
          { status: 400 },
        );
      }
      if (!hasReasons) {
        return NextResponse.json({ error: "At least one issue type is required" }, { status: 400 });
      }
    }

    const { supabase, user } = await getUserAndSupabase(req);

    const issueTypesArr = hasReasons ? (issueTypes as string[]) : ["other"];
    const descriptionVal = typeof description === "string" ? description.trim().slice(0, 2000) : null;
    const correctionTextVal = typeof correction_text === "string" ? correction_text.trim().slice(0, 2000) : null;
    const betterCardsVal = typeof better_cards_text === "string" ? better_cards_text.trim().slice(0, 1000) : null;
    const aiText = isSuggestionReport
      ? (typeof suggested_card_name === "string" ? suggested_card_name : null) || aiResponseText
      : aiResponseText;
    const userText = isSuggestionReport ? descriptionVal : (userMessageText ?? descriptionVal);

    let contextJsonb: Record<string, unknown> | null = null;
    if (isSuggestionReport) {
      contextJsonb = {
        source: DECK_ANALYZER_SOURCE,
        deck_id: deck_id ?? null,
        commander_name: commander_name ?? null,
        suggestion_id: suggestion_id ?? null,
        suggested_card_name: suggested_card_name ?? null,
        suggestion_category: suggestion_category ?? null,
        suggestion_index: suggestion_index ?? null,
        prompt_version_id: prompt_version_id ?? null,
      };
    } else if (isChatCorrection) {
      contextJsonb = {
        source: CHAT_CORRECTION_SOURCE,
        correction_text: correctionTextVal,
        better_cards_text: betterCardsVal,
        deck_id: deck_id ?? null,
        commander_name: commander_name ?? null,
        format: format ?? null,
        prompt_version_id: prompt_version_id ?? null,
        page_path: page_path ?? null,
        chat_surface: chat_surface ?? null,
      };
    } else if (isAppChatSurface) {
      contextJsonb = {
        source: "app_chat_issue",
        chat_surface: chatSurfaceRaw,
      };
    }

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

    if (!error) {
      try {
        const { captureServer } = await import("@/lib/server/analytics");
        if (typeof captureServer === "function") {
          await captureServer("chat_issue_report_submitted", {
            platform: isAppChatSurface ? "app" : "web",
            chat_surface: chatSurfaceRaw || null,
            thread_id: threadId ?? null,
            message_id: messageId ?? null,
            issue_types: issueTypesArr,
            description_length: descriptionVal?.length ?? 0,
            context_source:
              contextJsonb && typeof contextJsonb === "object" && "source" in contextJsonb
                ? String((contextJsonb as { source?: string }).source)
                : null,
          });
        }
      } catch {
        /* non-blocking */
      }
    }

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
    const { supabase, user } = await getUserAndSupabase(req);

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
