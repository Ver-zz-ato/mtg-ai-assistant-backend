/**
 * Shared admin check utility
 * Checks if a user is an admin based on ADMIN_USER_IDS and ADMIN_EMAILS env vars
 */

export function isAdmin(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}
