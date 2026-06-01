import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdminUser } from "@/lib/admin-auth";
import { applyModerationAction, getModerationStatus, isBanActive, type ModerationActionType } from "@/lib/admin/moderation";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set<ModerationActionType>(["warn", "ban", "unban", "note"]);

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const userId = String(req.nextUrl.searchParams.get("userId") || "").trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const [status, actionsResult, reportsResult] = await Promise.all([
      getModerationStatus(admin, userId),
      admin
        .from("user_moderation_actions")
        .select("id, action_type, reason, details, banned_until, report_id, created_at, created_by")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("user_content_reports")
        .select("id, subject_type, resource_type, reason, details, status, created_at, reporter_user_id, admin_notes", { count: "exact" })
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (actionsResult.error) throw actionsResult.error;
    if (reportsResult.error) throw reportsResult.error;

    const reportStatusCounts = { open: 0, reviewed: 0, resolved: 0, dismissed: 0 };
    for (const row of reportsResult.data || []) {
      const key = String(row.status || "") as keyof typeof reportStatusCounts;
      if (key in reportStatusCounts) reportStatusCounts[key] += 1;
    }

    const actorIds = Array.from(
      new Set(
        [
          ...(actionsResult.data || []).map((row) => row.created_by).filter(Boolean),
          ...(reportsResult.data || []).map((row) => row.reporter_user_id).filter(Boolean),
        ]
      )
    ) as string[];
    const actorMeta = new Map<string, { email: string | null; username: string | null }>();
    await Promise.all(
      actorIds.map(async (actorId) => {
        const { data } = await admin.auth.admin.getUserById(actorId);
        actorMeta.set(actorId, {
          email: data?.user?.email || null,
          username:
            ((data?.user?.user_metadata || {}) as { username?: string; display_name?: string }).username ||
            ((data?.user?.user_metadata || {}) as { username?: string; display_name?: string }).display_name ||
            null,
        });
      })
    );

    return NextResponse.json({
      ok: true,
      status: status
        ? {
            ...status,
            active_ban: isBanActive(status),
          }
        : {
            user_id: userId,
            warning_count: 0,
            is_banned: false,
            banned_until: null,
            last_action_type: null,
            last_reason: null,
            last_note: null,
            updated_at: null,
            updated_by: null,
            active_ban: false,
          },
      recentActions: (actionsResult.data || []).map((row) => ({
        ...row,
        actor: row.created_by
          ? {
              id: row.created_by,
              email: actorMeta.get(row.created_by)?.email || null,
              username: actorMeta.get(row.created_by)?.username || null,
            }
          : null,
      })),
      recentReports: (reportsResult.data || []).map((row) => ({
        ...row,
        reporter: row.reporter_user_id
          ? {
              id: row.reporter_user_id,
              email: actorMeta.get(row.reporter_user_id)?.email || null,
              username: actorMeta.get(row.reporter_user_id)?.username || null,
            }
          : null,
      })),
      reportCounts: {
        ...reportStatusCounts,
        total: reportsResult.count || 0,
      },
    });
  } catch (e: any) {
    console.error("[admin/users/moderation] GET failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const actionType = typeof body?.actionType === "string" ? body.actionType.trim().toLowerCase() as ModerationActionType : undefined;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const details = typeof body?.details === "string" ? body.details.trim() : "";
    const reportId = typeof body?.reportId === "string" ? body.reportId.trim() : "";
    const bannedUntil = typeof body?.bannedUntil === "string" ? body.bannedUntil.trim() : "";

    if (!userId) {
      return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
    }
    if (!actionType || !VALID_ACTIONS.has(actionType)) {
      return NextResponse.json({ ok: false, error: "invalid_action_type" }, { status: 400 });
    }
    if (!reason || reason.length < 3 || reason.length > 160) {
      return NextResponse.json({ ok: false, error: "invalid_reason" }, { status: 400 });
    }
    if (details.length > 4000) {
      return NextResponse.json({ ok: false, error: "details_too_long" }, { status: 400 });
    }
    if (actionType === "ban" && bannedUntil) {
      const ts = new Date(bannedUntil).getTime();
      if (!Number.isFinite(ts)) {
        return NextResponse.json({ ok: false, error: "invalid_banned_until" }, { status: 400 });
      }
    }

    const result = await applyModerationAction(admin, {
      userId,
      actionType,
      reason,
      details: details || null,
      reportId: reportId || null,
      bannedUntil: actionType === "ban" ? bannedUntil || null : null,
      adminUserId: user.id,
    });

    return NextResponse.json({
      ok: true,
      status: {
        ...result.status,
        active_ban: isBanActive(result.status),
      },
      actionId: result.actionId,
    });
  } catch (e: any) {
    console.error("[admin/users/moderation] POST failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

