import { NextRequest, NextResponse } from "next/server";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";
import { getAdmin } from "@/app/api/_lib/supa";
import { getModerationStatus, isBanActive } from "@/lib/admin/moderation";
import { notifyModerationReport } from "@/lib/admin/notifyModerationReport";

export const runtime = "nodejs";

type SubjectType = "public_profile" | "shared_item" | "shared_comment";
type ResourceType =
  | "public_profile"
  | "deck"
  | "collection"
  | "wishlist"
  | "roast"
  | "health_report"
  | "analysis_report"
  | "custom_card";

const VALID_SUBJECT_TYPES = new Set<SubjectType>(["public_profile", "shared_item", "shared_comment"]);
const VALID_RESOURCE_TYPES = new Set<ResourceType>([
  "public_profile",
  "deck",
  "collection",
  "wishlist",
  "roast",
  "health_report",
  "analysis_report",
  "custom_card",
]);

export async function POST(req: NextRequest) {
  try {
    const isMobileClient = req.headers.get("x-manatap-client") === "mobile_app";
    const authHeader = req.headers.get("authorization") ?? "";
    const hasBearer = authHeader.toLowerCase().startsWith("bearer ");
    if (!isMobileClient && !sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
    }
    const burst = checkRateLimit(req, {
      windowMs: 10 * 60 * 1000,
      maxRequests: 20,
      keyGenerator: (request) => `moderation-reports:${extractIP(request)}`,
    });
    if (!burst.allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 });
    }

    const { user, authError } = await getUserAndSupabase(req);
    if (authError && hasBearer) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }
    if (user) {
      const moderation = await getModerationStatus(admin, user.id);
      if (isBanActive(moderation)) {
        return NextResponse.json({ ok: false, error: "account_banned_from_public_actions" }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const subjectType = typeof body?.subject_type === "string" ? body.subject_type.trim() as SubjectType : null;
    const subjectId = typeof body?.subject_id === "string" ? body.subject_id.trim() : "";
    const targetUserId = typeof body?.target_user_id === "string" ? body.target_user_id.trim() : null;
    const resourceType = typeof body?.resource_type === "string" ? body.resource_type.trim() as ResourceType : null;
    const resourceId = typeof body?.resource_id === "string" ? body.resource_id.trim() : null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const details = typeof body?.details === "string" ? body.details.trim() : "";

    if (!subjectType || !VALID_SUBJECT_TYPES.has(subjectType)) {
      return NextResponse.json({ ok: false, error: "invalid_subject_type" }, { status: 400 });
    }
    if (!subjectId || subjectId.length > 120) {
      return NextResponse.json({ ok: false, error: "invalid_subject_id" }, { status: 400 });
    }
    if (!reason || reason.length < 3 || reason.length > 80) {
      return NextResponse.json({ ok: false, error: "invalid_reason" }, { status: 400 });
    }
    if (details.length > 2000) {
      return NextResponse.json({ ok: false, error: "details_too_long" }, { status: 400 });
    }
    if (resourceType && !VALID_RESOURCE_TYPES.has(resourceType)) {
      return NextResponse.json({ ok: false, error: "invalid_resource_type" }, { status: 400 });
    }
    if (subjectType === "public_profile" && !targetUserId) {
      return NextResponse.json({ ok: false, error: "target_user_id_required" }, { status: 400 });
    }
    if (subjectType === "shared_item" && (!resourceType || !resourceId)) {
      return NextResponse.json({ ok: false, error: "resource_required" }, { status: 400 });
    }
    if (subjectType === "shared_comment" && !resourceId) {
      return NextResponse.json({ ok: false, error: "resource_id_required" }, { status: 400 });
    }

    const context = {
      ip: extractIP(req),
      user_agent: req.headers.get("user-agent") || null,
      source: isMobileClient ? "mobile_app" : "web",
      authenticated: Boolean(user),
    };

    const { data: inserted, error } = await admin
      .from("user_content_reports")
      .insert({
        reporter_user_id: user?.id ?? null,
        subject_type: subjectType,
        subject_id: subjectId,
        target_user_id: targetUserId,
        resource_type: resourceType,
        resource_id: resourceId,
        reason,
        details: details || null,
        context_jsonb: context,
      })
      .select("id")
      .single();

    if (error) {
      console.error("moderation_report_post", error);
      return NextResponse.json({ ok: false, error: "Failed to submit report" }, { status: 500 });
    }

    void notifyModerationReport({
      reportId: inserted.id,
      subjectType,
      subjectId,
      reason,
      details: details || null,
      resourceType,
      resourceId,
      targetUserId,
      source: context.source,
      authenticated: context.authenticated,
    }).catch((discordErr) => {
      console.warn("moderation_report_discord", discordErr);
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("moderation_report_post", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
