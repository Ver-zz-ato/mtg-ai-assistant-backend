import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdminUser } from "@/lib/admin-auth";

export const runtime = "nodejs";

type ReportStatus = "open" | "reviewed" | "resolved" | "dismissed";

const VALID_STATUSES = new Set<ReportStatus>(["open", "reviewed", "resolved", "dismissed"]);

function usernameFromMeta(meta: unknown): string | null {
  const source = (meta || {}) as { username?: string; display_name?: string };
  return source.username || source.display_name || null;
}

export async function GET(req: NextRequest) {
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

    const status = String(req.nextUrl.searchParams.get("status") || "open").toLowerCase();
    const targetUserId = String(req.nextUrl.searchParams.get("targetUserId") || "").trim();
    const subjectType = String(req.nextUrl.searchParams.get("subjectType") || "").trim();
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") || 0));

    let query = admin
      .from("user_content_reports")
      .select(
        "id, reporter_user_id, subject_type, subject_id, target_user_id, resource_type, resource_id, reason, details, status, context_jsonb, created_at, admin_notes, reviewed_at, reviewed_by",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") query = query.eq("status", status);
    if (targetUserId) query = query.eq("target_user_id", targetUserId);
    if (subjectType) query = query.eq("subject_type", subjectType);

    const { data: reports, count, error } = await query;
    if (error) throw error;

    const userIds = Array.from(
      new Set(
        (reports || [])
          .flatMap((row) => [row.reporter_user_id, row.target_user_id, row.reviewed_by])
          .filter(Boolean)
      )
    ) as string[];

    const userMetaMap = new Map<string, { email: string | null; username: string | null }>();
    await Promise.all(
      userIds.map(async (userId) => {
        const { data } = await admin.auth.admin.getUserById(userId);
        userMetaMap.set(userId, {
          email: data?.user?.email || null,
          username: usernameFromMeta(data?.user?.user_metadata),
        });
      })
    );

    const targetStatusMap = new Map<string, { warning_count: number; is_banned: boolean; banned_until: string | null }>();
    if (targetUserId) {
      const { data: rows } = await admin
        .from("user_moderation_status")
        .select("user_id, warning_count, is_banned, banned_until")
        .eq("user_id", targetUserId);
      for (const row of rows || []) {
        targetStatusMap.set(String(row.user_id), {
          warning_count: Number(row.warning_count || 0),
          is_banned: !!row.is_banned,
          banned_until: row.banned_until || null,
        });
      }
    } else {
      const targetIds = Array.from(new Set((reports || []).map((row) => row.target_user_id).filter(Boolean))) as string[];
      if (targetIds.length) {
        const { data: rows } = await admin
          .from("user_moderation_status")
          .select("user_id, warning_count, is_banned, banned_until")
          .in("user_id", targetIds);
        for (const row of rows || []) {
          targetStatusMap.set(String(row.user_id), {
            warning_count: Number(row.warning_count || 0),
            is_banned: !!row.is_banned,
            banned_until: row.banned_until || null,
          });
        }
      }
    }

    const normalized = (reports || []).map((row) => ({
      ...row,
      reporter: row.reporter_user_id
        ? {
            id: row.reporter_user_id,
            email: userMetaMap.get(row.reporter_user_id)?.email || null,
            username: userMetaMap.get(row.reporter_user_id)?.username || null,
          }
        : null,
      targetUser: row.target_user_id
        ? {
            id: row.target_user_id,
            email: userMetaMap.get(row.target_user_id)?.email || null,
            username: userMetaMap.get(row.target_user_id)?.username || null,
            moderation: targetStatusMap.get(row.target_user_id) || null,
          }
        : null,
      reviewedByUser: row.reviewed_by
        ? {
            id: row.reviewed_by,
            email: userMetaMap.get(row.reviewed_by)?.email || null,
            username: userMetaMap.get(row.reviewed_by)?.username || null,
          }
        : null,
    }));

    return NextResponse.json({ ok: true, reports: normalized, total: count || 0 });
  } catch (e: any) {
    console.error("[admin/moderation/reports] GET failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const reportId = typeof body?.reportId === "string" ? body.reportId.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() as ReportStatus : undefined;
    const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes.trim() : undefined;

    if (!reportId) {
      return NextResponse.json({ ok: false, error: "report_id_required" }, { status: 400 });
    }
    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }
    if (adminNotes && adminNotes.length > 4000) {
      return NextResponse.json({ ok: false, error: "admin_notes_too_long" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };
    if (status) patch.status = status;
    if (adminNotes !== undefined) patch.admin_notes = adminNotes || null;

    const { data, error } = await admin
      .from("user_content_reports")
      .update(patch)
      .eq("id", reportId)
      .select("id, status, admin_notes, reviewed_at, reviewed_by")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, report: data });
  } catch (e: any) {
    console.error("[admin/moderation/reports] PATCH failed", e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

