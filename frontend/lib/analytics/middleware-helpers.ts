/**
 * Analytics helpers for middleware (Node.js / Edge).
 * No browser APIs; use headers and URL only.
 */

const BOT_UA_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /discordbot/i,
  /whatsapp/i,
  /slackbot/i,
  /telegrambot/i,
  /headlesschrome/i,
  /lighthouse/i,
  /petalbot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
];

const EXCLUDED_FIRST_VISIT_PATHS = [
  '/manifest.json',
  '/robots.txt',
  '/favicon.ico',
  '/index.html',
  '/sitemap.xml',
];

const EXCLUDED_PREFIXES = ['/icons/', '/_next/', '/assets/'];

export function isExcludedPath(path: string): boolean {
  if (EXCLUDED_FIRST_VISIT_PATHS.some((p) => path === p)) return true;
  if (/^\/sitemap.*\.xml$/.test(path)) return true;
  if (EXCLUDED_PREFIXES.some((pre) => path.startsWith(pre))) return true;
  return false;
}

export function isBot(userAgent: string): boolean {
  const ua = userAgent || '';
  return BOT_UA_PATTERNS.some((re) => re.test(ua));
}

export function isRealHtmlNavigation(
  method: string,
  accept: string | null,
  secFetchDest: string | null
): boolean {
  if (method !== 'GET') return false;
  const acceptHtml = accept != null && /text\/html/i.test(accept);
  const destDocument = secFetchDest != null && /document/i.test(secFetchDest);
  return acceptHtml || destDocument;
}

export function getDeviceTypeFromUA(userAgent: string): 'mobile' | 'desktop' | 'tablet' {
  const ua = (userAgent || '').toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile';
  if (/ipad|android.*tablet|tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

export function getUtmFromUrl(search: string): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
} {
  const params = new URLSearchParams(search || '');
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  };
}

export const PV_LAST_COOKIE = 'pv_last';
export const PV_LAST_MAX_AGE = 3600;
export const PV_RATE_LIMIT_MS = 30_000;

export function parsePvLast(value: string | undefined): { path: string; ts: number } | null {
  if (!value || typeof value !== 'string') return null;
  const sep = value.indexOf('|');
  if (sep < 0) return null;
  const path = value.slice(0, sep);
  const ts = parseInt(value.slice(sep + 1), 10);
  if (!path || Number.isNaN(ts)) return null;
  return { path, ts };
}

export function formatPvLast(path: string, ts: number): string {
  return `${path}|${ts}`;
}
