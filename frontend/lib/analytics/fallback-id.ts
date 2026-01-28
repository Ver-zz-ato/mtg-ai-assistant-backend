/**
 * Fallback distinct_id when we have neither user_id nor visitor_id.
 * Avoids 'anon' which would merge unrelated users in PostHog.
 */

import { randomUUID } from 'crypto';

export const FALLBACK_ID_COOKIE = 'ajs_anonymous_id';
export const FALLBACK_ID_MAX_AGE = 3600; // 1h

export function ensureDistinctId(
  userId: string | null,
  visitorId: string | null,
  cookies: { get: (name: string) => { value: string } | undefined }
): { distinctId: string; isFallback: boolean; isNew: boolean } {
  if (userId) return { distinctId: userId, isFallback: false, isNew: false };
  if (visitorId) return { distinctId: visitorId, isFallback: false, isNew: false };
  const existing = cookies.get(FALLBACK_ID_COOKIE)?.value;
  if (existing && existing.startsWith('fallback_')) return { distinctId: existing, isFallback: true, isNew: false };
  const id = `fallback_${randomUUID()}`;
  return { distinctId: id, isFallback: true, isNew: true };
}
