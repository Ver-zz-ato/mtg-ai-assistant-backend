/**
 * Admin allowlist via env (same rules as /api/admin/config and budget-swaps).
 */
export function isAdminUser(user: { id?: string; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const ids = String(process.env.ADMIN_USER_IDS || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user.id || "");
  const email = String(user.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}
