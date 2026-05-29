import { NextRequest, NextResponse } from "next/server";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { bodyFromChatReportPayload, submitAiFeedback } from "@/lib/ai/submit-ai-feedback";

const DECK_ANALYZER_SOURCE = "deck_analyzer_suggestion";
const CHAT_CORRECTION_SOURCE = "chat_correction";

export async function POST(req: NextRequest) {
  const burst = checkRateLimit(req, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyGenerator: (request) => `chat_report:${extractIP(request)}`,
  });
  if (!burst.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 }),
      burst,
    );
  }

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
        return addRateLimitHeaders(
          NextResponse.json({ error: "Select at least one reason or add a description" }, { status: 400 }),
          burst,
        );
      }
    } else if (isChatCorrection) {
      if (!hasReasons && !hasDescription && !hasCorrectionText && !hasBetterCards) {
        return addRateLimitHeaders(
          NextResponse.json(
            { error: "Add at least one reason, what it should have said, or better cards" },
            { status: 400 },
          ),
          burst,
        );
      }
    } else {
      if (isAppChatSurface && !hasDescription) {
        return addRateLimitHeaders(
          NextResponse.json({ error: "Please add a short description of the issue" }, { status: 400 }),
          burst,
        );
      }
      if (!hasReasons) {
        return addRateLimitHeaders(
          NextResponse.json({ error: "At least one issue type is required" }, { status: 400 }),
          burst,
        );
      }
    }

    const { user } = await getUserAndSupabase(req);

    const feedbackBody = bodyFromChatReportPayload(body as Record<string, unknown>, page_path);
    if (!feedbackBody) {
      return addRateLimitHeaders(
        NextResponse.json({ error: "Invalid report payload" }, { status: 400 }),
        burst,
      );
    }

    const result = await submitAiFeedback({ req, user, body: feedbackBody });
    if (!result.ok) {
      return addRateLimitHeaders(
        NextResponse.json({ error: result.error }, { status: result.status }),
        burst,
      );
    }

    try {
      const { captureServer } = await import("@/lib/server/analytics");
      if (typeof captureServer === "function") {
        await captureServer("chat_issue_report_submitted", {
          platform: isAppChatSurface ? "app" : "web",
          chat_surface: chatSurfaceRaw || null,
          thread_id: threadId ?? null,
          message_id: messageId ?? null,
          issue_types: feedbackBody.issueTypes ?? [],
          description_length: feedbackBody.comment?.length ?? 0,
          feedback_event_id: result.id,
        });
      }
    } catch {
      /* non-blocking */
    }

    return addRateLimitHeaders(NextResponse.json({ ok: true, id: result.id }), burst);
  } catch {
    return addRateLimitHeaders(
      NextResponse.json({ error: "Internal error" }, { status: 500 }),
      burst,
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getUserAndSupabase(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase());
    if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("ai_response_reports")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
    }

    return NextResponse.json({ reports: data, total: count });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
