import { cookies, headers } from 'next/headers';
import { WEB_SESSION_COOKIE } from '@/lib/analytics/common';

export const ANALYTICS_SESSION_HEADER = 'x-analytics-session-id';

type CookieLike = {
  get(name: string): { value?: string } | undefined;
};

type HeaderLike = {
  get(name: string): string | null | undefined;
};

type RequestLike = {
  cookies?: CookieLike;
  headers?: HeaderLike;
};

function readHeader(headersLike?: HeaderLike | null): string | null {
  const value = headersLike?.get?.(ANALYTICS_SESSION_HEADER) ?? headersLike?.get?.('x-session-id') ?? null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readCookie(cookiesLike?: CookieLike | null): string | null {
  const value = cookiesLike?.get?.(WEB_SESSION_COOKIE)?.value ?? null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function resolveAnalyticsSessionId(request?: RequestLike | null): Promise<string | null> {
  const explicitHeader = readHeader(request?.headers);
  if (explicitHeader) return explicitHeader;

  const explicitCookie = readCookie(request?.cookies);
  if (explicitCookie) return explicitCookie;

  try {
    const scopedHeaders = await headers();
    const scopedHeader = readHeader(scopedHeaders);
    if (scopedHeader) return scopedHeader;
  } catch {}

  try {
    const scopedCookies = await cookies();
    const scopedCookie = readCookie(scopedCookies);
    if (scopedCookie) return scopedCookie;
  } catch {}

  return null;
}
