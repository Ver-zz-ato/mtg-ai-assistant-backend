import type { SupabaseClient } from "@supabase/supabase-js";

export type ModerationActionType = "warn" | "ban" | "unban" | "note";
export type ModerationReportStatus = "open" | "reviewed" | "resolved" | "dismissed";

export type ModerationStatusRow = {
  user_id: string;
  warning_count: number;
  is_banned: boolean;
  banned_until: string | null;
  last_action_type: ModerationActionType | null;
  last_reason: string | null;
  last_note: string | null;
  updated_at: string;
  updated_by: string | null;
};

type ApplyModerationActionInput = {
  userId: string;
  actionType: ModerationActionType;
  reason: string;
  details?: string | null;
  reportId?: string | null;
  bannedUntil?: string | null;
  adminUserId?: string | null;
};

export function isBanActive(status: Pick<ModerationStatusRow, "is_banned" | "banned_until"> | null | undefined): boolean {
  if (!status?.is_banned) return false;
  if (!status.banned_until) return true;
  const ts = new Date(status.banned_until).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

export function formatBanLabel(status: Pick<ModerationStatusRow, "is_banned" | "banned_until"> | null | undefined): string {
  if (!status?.is_banned) return "Not banned";
  if (!status.banned_until) return "Permanent ban";
  return isBanActive(status) ? `Banned until ${status.banned_until}` : `Expired ban (${status.banned_until})`;
}

export async function getModerationStatus(
  admin: SupabaseClient,
  userId: string
): Promise<ModerationStatusRow | null> {
  const { data, error } = await admin
    .from("user_moderation_status")
    .select("user_id, warning_count, is_banned, banned_until, last_action_type, last_reason, last_note, updated_at, updated_by")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as ModerationStatusRow | null) ?? null;
}

export async function applyModerationAction(
  admin: SupabaseClient,
  input: ApplyModerationActionInput
): Promise<{ status: ModerationStatusRow; actionId: string | null }> {
  const nowIso = new Date().toISOString();
  const reason = input.reason.trim();
  const details = input.details?.trim() || null;
  const bannedUntil = input.bannedUntil || null;

  const { data: insertedAction, error: insertError } = await admin
    .from("user_moderation_actions")
    .insert({
      user_id: input.userId,
      action_type: input.actionType,
      reason,
      details,
      banned_until: input.actionType === "ban" ? bannedUntil : null,
      report_id: input.reportId || null,
      created_by: input.adminUserId || null,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

  const current = await getModerationStatus(admin, input.userId);
  const nextWarningCount =
    input.actionType === "warn"
      ? Math.max(0, Number(current?.warning_count || 0) + 1)
      : Math.max(0, Number(current?.warning_count || 0));

  const nextStatus = {
    user_id: input.userId,
    warning_count: nextWarningCount,
    is_banned: input.actionType === "ban" ? true : input.actionType === "unban" ? false : !!current?.is_banned,
    banned_until:
      input.actionType === "ban"
        ? bannedUntil
        : input.actionType === "unban"
          ? null
          : current?.banned_until || null,
    last_action_type: input.actionType,
    last_reason: reason,
    last_note: details,
    updated_at: nowIso,
    updated_by: input.adminUserId || null,
  };

  const { data: savedStatus, error: upsertError } = await admin
    .from("user_moderation_status")
    .upsert(nextStatus, { onConflict: "user_id" })
    .select("user_id, warning_count, is_banned, banned_until, last_action_type, last_reason, last_note, updated_at, updated_by")
    .single();

  if (upsertError) throw upsertError;

  return {
    status: savedStatus as ModerationStatusRow,
    actionId: (insertedAction as { id?: string } | null)?.id || null,
  };
}

