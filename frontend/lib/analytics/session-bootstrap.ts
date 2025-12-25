/**
 * Session bootstrap for tracking landing page and referrer
 * Stores landing_page once per session in sessionStorage
 */

const LANDING_PAGE_KEY = 'analytics:landing_page';
const SESSION_START_KEY = 'analytics:session_start';

export interface SessionContext {
  landing_page: string;
  referrer: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  device_type: 'mobile' | 'desktop' | 'tablet';
  is_authenticated: boolean;
  current_path: string;
}

/**
 * Get or initialize landing page for current session
 * Stores in sessionStorage (cleared on tab close)
 */
export function getLandingPage(): string {
  if (typeof window === 'undefined') return '/';
  
  const stored = sessionStorage.getItem(LANDING_PAGE_KEY);
  if (stored) return stored;
  
  // First visit in this session - store current path
  const landing = window.location.pathname + window.location.search;
  sessionStorage.setItem(LANDING_PAGE_KEY, landing);
  sessionStorage.setItem(SESSION_START_KEY, Date.now().toString());
  
  return landing;
}

/**
 * Get referrer (from document.referrer or URL params)
 */
export function getReferrer(): string {
  if (typeof window === 'undefined') return '';
  
  // Check URL params first (for UTM tracking)
  const params = new URLSearchParams(window.location.search);
  const refParam = params.get('ref') || params.get('referrer');
  if (refParam) return refParam;
  
  // Fall back to document.referrer
  return document.referrer || '';
}

/**
 * Extract UTM parameters from URL
 */
export function getUTMParams(): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
} {
  if (typeof window === 'undefined') return {};
  
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  };
}

/**
 * Detect device type from user agent
 */
export function getDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  
  const ua = navigator.userAgent.toLowerCase();
  const width = window.innerWidth;
  
  // Tablet detection (iPad, Android tablets)
  if (
    /ipad|android/.test(ua) && width >= 768 ||
    /tablet/.test(ua)
  ) {
    return 'tablet';
  }
  
  // Mobile detection
  if (
    /mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(ua) ||
    width < 768
  ) {
    return 'mobile';
  }
  
  return 'desktop';
}

/**
 * Get current path (pathname + search, no hash)
 */
export function getCurrentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

/**
 * Get full session context for event enrichment
 */
export function getSessionContext(isAuthenticated: boolean): SessionContext {
  return {
    landing_page: getLandingPage(),
    referrer: getReferrer(),
    ...getUTMParams(),
    device_type: getDeviceType(),
    is_authenticated: isAuthenticated,
    current_path: getCurrentPath(),
  };
}

/**
 * Reset session (for testing or manual reset)
 */
export function resetSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LANDING_PAGE_KEY);
  sessionStorage.removeItem(SESSION_START_KEY);
}
