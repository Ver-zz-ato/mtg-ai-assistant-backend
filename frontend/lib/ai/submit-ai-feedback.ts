import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { containsProfanity } from "@/lib/profanity";
import { getServiceRoleClient } from "@/lib/server-supabase";
const MAX_COMMENT = 2000;
const MAX_USER_INPUT = 4000;
const MAX_AI_OUTPUT = 8000;
const MAX_FEATURE = 100;
const MAX_ROUTE = 200;
const MAX_ISSUE_TYPES = 20;

export const aiFeedbackBodySchema = z.object({
  submissionId: z.string().uuid().optional().nullable(),
  feature: z.string().trim().min(1).max(MAX_FEATURE),
  route: z.string().trim().max(MAX_ROUTE).optional().nullable(),
  surfaceKind: z.enum(["chat_message", "ai_result", "modal_session"]),
  rating: z.number().int().min(-1).max(1).optional().nullable(),
  comment: z.string().trim().max(MAX_COMMENT).optional().nullable(),
  issueTypes: z.array(z.string().trim().min(1).max(64)).max(MAX_ISSUE_TYPES).optional().nullable(),
  userInputText: z.string().max(MAX_USER_INPUT).optional().nullable(),
  aiOutputText: z.string().max(MAX_AI_OUTPUT).optional().nullable(),
  context: z.record(z.unknown()).optional().nullable(),
  includeContext: z.boolean().optional().nullable(),
});

export type AiFeedbackBody = z.infer<typeof aiFeedbackBodySchema>;

export type SubmitAiFeedbackOptions = {
  req: NextRequest;
  user: User | null;
  body: AiFeedbackBody;
};

export type SubmitAiFeedbackResult =
  | { ok: true; id: string; duplicate?: boolean }
  | { ok: false; error: string; status: number };

function detectClient(req: NextRequest): "app" | "web" {
  const h = req.headers.get("x-manatap-client")?.trim().toLowerCase() ?? "";
  if (h === "manatap_app" || h === "app") return "app";
  return "web";
}

function hashGuestKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function guestKeyFromRequest(req: NextRequest): string | null {
  const token =
    req.headers.get("X-Guest-Session-Token")?.trim() ||
    req.headers.get("x-guest-session-token")?.trim() ||
    "";
  if (!token) return null;
  return hashGuestKey(token);
}

function truncate(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  return t.length <= max ? t : t.slice(0, max);
}

function sanitizeContext(ctx: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!ctx || typeof ctx !== "object") return {};
  const out: Record<string, unknown> = {};
  const allow = [
    "deck_id",
    "deck_title",
    "commander_name",
    "card_name",
    "thread_id",
    "message_id",
    "prompt_version_id",
    "format",
    "scan_category",
    "scan_label",
    "suggestion_id",
    "suggested_card_name",
    "suggestion_category",
    "suggestion_index",
    "chat_surface",
    "page_path",
    "correction_text",
    "better_cards_text",
    "source",
    "app_version",
    "platform",
  ];
  for (const key of allow) {
    if (key in ctx && ctx[key] != null && ctx[key] !== "") {
      out[key] = ctx[key];
    }
  }
  return out;
}

/** Map legacy analyze usefulness 5/2 to ±1 */
export function normalizeLegacyRating(rating: number | null | undefined): -1 | 0 | 1 | null {
  if (rating == null) return null;
  if (rating >= 4) return 1;
  if (rating <= 2 && rating >= 0) return -1;
  if (rating === 1) return 1;
  if (rating === -1) return -1;
  if (rating === 0) return 0;
  return rating > 0 ? 1 : -1;
}

const AI_FEEDBACK_SOURCE_PREFIXES = [
  "app_",
  "deck_analysis",
  "chat",
  "deck_analyzer",
  "chat_correction",
  "deck_roast",
  "mulligan",
  "budget",
  "analysis",
];

export function isAiFeedbackSource(source: string | null | undefined): boolean {
  const s = (source ?? "").trim().toLowerCase();
  if (!s) return false;
  return AI_FEEDBACK_SOURCE_PREFIXES.some((p) => s === p || s.startsWith(p));
}

export async function submitAiFeedback(
  options: SubmitAiFeedbackOptions,
): Promise<SubmitAiFeedbackResult> {
  const { req, user, body } = options;
  const isAnonymous = !user?.id;
  const guestKey = isAnonymous ? guestKeyFromRequest(req) : null;

  const rating = body.rating ?? null;
  const comment = truncate(body.comment, MAX_COMMENT);
  const issueTypes = (body.issueTypes ?? []).filter(Boolean).slice(0, MAX_ISSUE_TYPES);
  const hasReportPayload =
    issueTypes.length > 0 || (comment != null && comment.length >= 8);

  if (rating == null && !comment && issueTypes.length === 0) {
    return { ok: false, error: "feedback_requires_rating_or_comment", status: 400 };
  }

  if (comment && containsProfanity(comment)) {
    return { ok: false, error: "comment_contains_disallowed_words", status: 400 };
  }

  const signedInFullContext = !!user?.id && body.includeContext !== false;
  const guestReportContext = isAnonymous && hasReportPayload;
  const guestThumbOnly = isAnonymous && !hasReportPayload;

  let userInputText: string | null = null;
  let aiOutputText: string | null = null;
  if (signedInFullContext || guestReportContext) {
    userInputText = truncate(body.userInputText, MAX_USER_INPUT);
    aiOutputText = truncate(body.aiOutputText, MAX_AI_OUTPUT);
  }

  const contextJsonb = sanitizeContext({
    ...(body.context ?? {}),
    ...(isAnonymous
      ? {
          visitor_type: "guest",
          app_version: req.headers.get("X-App-Version") ?? undefined,
          platform: req.headers.get("X-App-Platform") ?? undefined,
        }
      : {}),
  });

  if (guestThumbOnly) {
    // Thumbs-only from guests: no transcript text stored.
    userInputText = null;
    aiOutputText = null;
  }

  const db = getServiceRoleClient();
  if (!db) {
    return { ok: false, error: "feedback_storage_unavailable", status: 503 };
  }

  const submissionId = body.submissionId?.trim() || null;
  if (submissionId) {
    const { data: existing } = await db
      .from("ai_feedback_events")
      .select("id")
      .eq("submission_id", submissionId)
      .maybeSingle();
    if (existing?.id) {
      return { ok: true, id: existing.id, duplicate: true };
    }
  }

  const row = {
    user_id: user?.id ?? null,
    guest_key: guestKey,
    client: detectClient(req),
    feature: body.feature.trim(),
    route: truncate(body.route, MAX_ROUTE),
    surface_kind: body.surfaceKind,
    rating,
    comment,
    issue_types: issueTypes,
    user_input_text: userInputText,
    ai_output_text: aiOutputText,
    context_jsonb: contextJsonb,
    submission_id: submissionId,
    status: "submitted",
  };

  const { data, error } = await db.from("ai_feedback_events").insert(row).select("id").single();

  if (error) {
    if (error.code === "42P01") {
      return { ok: false, error: "feedback_table_pending", status: 503 };
    }
    return { ok: false, error: "feedback_submit_failed", status: 400 };
  }

  try {
    const { captureServer } = await import("@/lib/server/analytics");
    if (typeof captureServer === "function") {
      await captureServer("ai_feedback_submitted", {
        user_id: user?.id ?? null,
        client: row.client,
        feature: row.feature,
        surface_kind: row.surface_kind,
        rating: row.rating,
        has_comment: !!row.comment,
        issue_type_count: issueTypes.length,
        route: row.route,
      });
    }
  } catch {
    /* non-blocking */
  }

  return { ok: true, id: data.id };
}

/** Build body from legacy POST /api/chat/report JSON */
export function bodyFromChatReportPayload(
  raw: Record<string, unknown>,
  pagePath?: string | null,
): AiFeedbackBody | null {
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  const isSuggestion = source === "deck_analyzer_suggestion";
  const isCorrection = source === "chat_correction";
  const chatSurfaceRaw =
    typeof raw.chat_surface === "string" ? raw.chat_surface.trim() : "";

  const issueTypes = Array.isArray(raw.issueTypes)
    ? (raw.issueTypes as string[]).filter((x) => typeof x === "string")
    : [];

  const description =
    typeof raw.description === "string" ? raw.description.trim().slice(0, MAX_COMMENT) : null;
  const correctionText =
    typeof raw.correction_text === "string"
      ? raw.correction_text.trim().slice(0, MAX_COMMENT)
      : null;
  const betterCards =
    typeof raw.better_cards_text === "string"
      ? raw.better_cards_text.trim().slice(0, 1000)
      : null;

  const aiResponseText =
    typeof raw.aiResponseText === "string"
      ? raw.aiResponseText
      : typeof raw.suggested_card_name === "string"
        ? raw.suggested_card_name
        : null;

  const userMessageText =
    typeof raw.userMessageText === "string" ? raw.userMessageText : description;

  let feature = "web_chat_thread";
  if (isSuggestion) feature = "deck_analyzer_suggestion";
  else if (isCorrection) feature = "chat_correction";
  else if (chatSurfaceRaw.startsWith("app_")) feature = chatSurfaceRaw;
  else if (source === "app_chat_issue" || chatSurfaceRaw) feature = chatSurfaceRaw || "app_chat_issue";

  const context: Record<string, unknown> = {
    source: source || (chatSurfaceRaw ? "app_chat_issue" : "web_chat_report"),
    thread_id: raw.threadId ?? null,
    message_id: raw.messageId ?? null,
    deck_id: raw.deck_id ?? null,
    commander_name: raw.commander_name ?? null,
    format: raw.format ?? null,
    prompt_version_id: raw.prompt_version_id ?? null,
    page_path: pagePath ?? raw.page_path ?? null,
    chat_surface: chatSurfaceRaw || null,
    suggestion_id: raw.suggestion_id ?? null,
    suggested_card_name: raw.suggested_card_name ?? null,
    suggestion_category: raw.suggestion_category ?? null,
    suggestion_index: raw.suggestion_index ?? null,
    correction_text: correctionText,
    better_cards_text: betterCards,
  };

  const comment = description || correctionText || betterCards || null;

  return {
    feature,
    route: pagePath ?? null,
    surfaceKind: isSuggestion ? "modal_session" : "chat_message",
    rating: null,
    comment,
    issueTypes: issueTypes.length ? issueTypes : comment ? ["other"] : ["bad_recommendation"],
    userInputText: userMessageText,
    aiOutputText: aiResponseText,
    context,
    includeContext: true,
  };
}

/** Build body from legacy quick feedback (rating + source) */
export function bodyFromQuickFeedbackPayload(raw: {
  rating?: number | null;
  text?: string;
  source?: string | null;
  route?: string | null;
}): AiFeedbackBody {
  const source = (raw.source ?? "feedback").trim();
  const feature = source.startsWith("app_") ? source : source;
  let surfaceKind: AiFeedbackBody["surfaceKind"] = "ai_result";
  if (source.includes("chat")) surfaceKind = "chat_message";

  return {
    feature,
    route: raw.route ?? null,
    surfaceKind,
    rating: normalizeLegacyRating(raw.rating),
    comment: raw.text?.trim() || null,
    issueTypes: [],
    includeContext: true,
  };
}
