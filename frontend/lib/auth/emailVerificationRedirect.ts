/** Success page shown after email signup / email-change confirmation. */
export const EMAIL_CONFIRM_SUCCESS_PATH = '/auth/confirmed?verified=1';

/** PKCE / ConfirmationURL redirect — exchanges code server-side, then lands on success page. */
export function getEmailSignupRedirectTo(origin: string): string {
  const next = encodeURIComponent(EMAIL_CONFIRM_SUCCESS_PATH);
  return `${origin}/auth/callback?next=${next}`;
}

/**
 * Token-hash link for Supabase email templates (query params survive mobile email clients).
 * Template: <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm</a>
 */
export function getEmailConfirmTokenHashPath(): string {
  return '/auth/confirm?type=signup';
}

export function appendEmailToConfirmedUrl(path: string, email?: string | null): string {
  if (!email?.trim()) return path;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.manatap.ai';
    const u = new URL(path, base);
    if (u.pathname === '/auth/confirmed' && !u.searchParams.has('email')) {
      u.searchParams.set('email', email.trim());
    }
    return u.pathname + u.search;
  } catch {
    return path;
  }
}
