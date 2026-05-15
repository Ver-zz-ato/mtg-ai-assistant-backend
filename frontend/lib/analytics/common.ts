const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'auth',
  'authorization',
  'bearer',
  'code',
  'email',
  'id_token',
  'jwt',
  'otp',
  'password',
  'refresh_token',
  'session',
  'session_id',
  'token',
]);

export const ATTRIBUTION_FIRST_COOKIE = 'mt_attr_first';
export const ATTRIBUTION_CURRENT_COOKIE = 'mt_attr_current';
export const WEB_SESSION_COOKIE = 'mt_session_id';
export const WEB_SESSION_MAX_AGE = 60 * 30;
export const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export type AnalyticsPlatform = 'web' | 'app' | 'server';
export type AnalyticsSurface = 'website' | 'mobile_app' | 'api' | 'admin';
export type AnalyticsTier = 'guest' | 'free' | 'pro' | 'unknown';
export type DeckFormatAnalytics =
  | 'commander'
  | 'standard'
  | 'modern'
  | 'pioneer'
  | 'pauper'
  | 'unknown'
  | null;

export type AnalyticsCommonProps = {
  platform: AnalyticsPlatform;
  app_surface: AnalyticsSurface;
  user_tier: AnalyticsTier;
  logged_in: boolean;
  source_surface: string | null;
  source_feature: string | null;
  route_path: string | null;
  session_id: string | null;
  app_version: string | null;
  build_number: string | null;
  environment: string;
  deck_id_present: boolean;
  deck_format: DeckFormatAnalytics;
};

export type AttributionData = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  referring_domain: string | null;
  landing_path: string | null;
  landing_url: string | null;
  channel_type: string | null;
  first_seen_at: string | null;
};

export function sanitizeAnalyticsUrl(rawUrl: string | null | undefined, base?: string): string | null {
  if (!rawUrl) return null;
  try {
    const fallbackBase =
      base ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://www.manatap.ai';
    const url = new URL(rawUrl, fallbackBase);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    const normalizedSearch = url.searchParams.toString();
    return `${url.origin}${url.pathname}${normalizedSearch ? `?${normalizedSearch}` : ''}`;
  } catch {
    return rawUrl;
  }
}

export function getReferringDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
}

export function deriveChannelType(input: {
  utm_source?: string | null;
  utm_medium?: string | null;
  referrer?: string | null;
  referring_domain?: string | null;
}): string | null {
  const medium = String(input.utm_medium || '').toLowerCase();
  const source = String(input.utm_source || '').toLowerCase();
  const domain = String(input.referring_domain || '').toLowerCase();
  if (!medium && !source && !domain && !input.referrer) return 'direct';
  if (['cpc', 'ppc', 'paid', 'paid_social', 'display'].includes(medium)) return 'paid';
  if (['email', 'newsletter'].includes(medium)) return 'email';
  if (['social', 'social_paid', 'social-organic'].includes(medium)) return 'social';
  if (medium === 'organic') return 'organic_search';
  if (/google|bing|duckduckgo|yahoo/.test(domain) || source === 'google') return 'organic_search';
  if (/facebook|instagram|tiktok|x\.com|twitter|reddit|youtube|linkedin/.test(domain)) return 'social';
  return 'referral';
}

export function serializeAttributionCookie(data: Partial<AttributionData>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

export function parseAttributionCookie(value: string | null | undefined): AttributionData | null {
  if (!value) return null;
  try {
    const params = new URLSearchParams(value);
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      utm_term: params.get('utm_term'),
      referrer: params.get('referrer'),
      referring_domain: params.get('referring_domain'),
      landing_path: params.get('landing_path'),
      landing_url: params.get('landing_url'),
      channel_type: params.get('channel_type'),
      first_seen_at: params.get('first_seen_at'),
    };
  } catch {
    return null;
  }
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildAnalyticsCommonProps(
  input: Partial<AnalyticsCommonProps> & Pick<AnalyticsCommonProps, 'platform' | 'app_surface'>
): AnalyticsCommonProps {
  return {
    platform: input.platform,
    app_surface: input.app_surface,
    user_tier: input.user_tier ?? 'unknown',
    logged_in: input.logged_in ?? false,
    source_surface: input.source_surface ?? null,
    source_feature: input.source_feature ?? null,
    route_path: input.route_path ?? null,
    session_id: input.session_id ?? null,
    app_version: input.app_version ?? process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    build_number: input.build_number ?? process.env.NEXT_PUBLIC_BUILD_NUMBER ?? null,
    environment:
      input.environment ??
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      'development',
    deck_id_present: input.deck_id_present ?? false,
    deck_format: input.deck_format ?? null,
  };
}

export function formatIsoWeek(dateInput: string | number | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
