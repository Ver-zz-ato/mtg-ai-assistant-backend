import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { captureServer } from './lib/server/analytics';
import { validateEnv } from './lib/env';
import {
  isExcludedPath,
  isBot,
  isRealHtmlNavigation,
  getDeviceTypeFromUA,
  getUtmFromUrl,
  PV_LAST_COOKIE,
  PV_LAST_MAX_AGE,
  PV_RATE_LIMIT_MS,
  parsePvLast,
  formatPvLast,
} from './lib/analytics/middleware-helpers';

// Validate environment variables at startup (fail fast)
try {
  validateEnv();
} catch (error) {
  // Log error but don't crash - middleware runs on every request
  // The error will be caught when API routes try to use missing env vars
  if (process.env.NODE_ENV === 'development') {
    console.error('[Middleware] Environment validation warning:', error);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  
  // WWW redirect: Ensure bare domain (manatap.ai) redirects to www.manatap.ai (single hop)
  // Do NOT redirect other subdomains (e.g., app.manatap.ai)
  const host = req.headers.get('host') || '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0');
  
  // Extract hostname without port
  const hostname = host.split(':')[0];
  
  // Only redirect bare domain (manatap.ai) to www in production
  if (!isLocalhost && hostname === 'manatap.ai') {
    const url = req.nextUrl.clone();
    url.host = 'www.manatap.ai';
    url.protocol = 'https:';
    // Preserve pathname and search params
    
    // Create redirect response with explicit 308 status
    // Use manual Response construction to ensure 308 (not 307) is honored
    const redirectUrl = url.toString();
    
    // Build headers object - always include debug header to verify source
    const headers = new Headers();
    headers.set('Location', redirectUrl);
    if (process.env.NODE_ENV === 'development') {
      headers.set('x-redirect-source', 'middleware-www');
    }
    
    const response = new NextResponse(null, {
      status: 308, // Permanent Redirect (preserves HTTP method)
      headers,
    });
    return response;
  }
  
  // Initialize response (will be modified for guest tokens)
  let response: NextResponse | null = null;

  // Handle API routes (Supabase auth + maintenance mode)
  if (path.startsWith('/api/')) {
    response = NextResponse.next();

    // Cookie log hygiene: auth-helpers may log before throwing when cookies have base64- prefix.
    // Suppress only those messages in this scope; restore console in finally so other requests are unaffected.
    // Patterns suppressed: "Failed to parse cookie string", "base64-", "Unexpected token" + "base64-eyJ".
    const origError = console.error;
    const origWarn = console.warn;
    const shouldSuppress = (msg: unknown): boolean => {
      const s =
        typeof msg === 'string'
          ? msg
          : msg != null && typeof (msg as Error).message === 'string'
            ? (msg as Error).message
            : String(msg);
      if (s.includes('Failed to parse cookie string') || s.includes('base64-')) return true;
      if (s.includes('Unexpected token') && s.includes('base64-eyJ')) return true;
      return false;
    };
    console.error = (...args: unknown[]) => {
      if (args.length > 0 && shouldSuppress(args[0])) return;
      origError.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      if (args.length > 0 && shouldSuppress(args[0])) return;
      origWarn.apply(console, args);
    };

    try {
      // Attach/refresh Supabase cookies; never block on error.
      try {
        const supabase = createMiddlewareClient({ req, res: response as NextResponse });
        await supabase.auth.getSession();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const msgStr = typeof msg === 'string' ? msg : String(msg);
        if (msgStr.includes('Failed to parse cookie string') || msgStr.includes('base64-') || msgStr.includes('Unexpected token')) {
          // Silently ignore — known when cookies have base64- prefix; sign-in still works via route handlers
        } else if (process.env.NODE_ENV === 'development') {
          origError.call(console, 'Supabase middleware getSession error:', e);
        }
      }
    } finally {
      console.error = origError;
      console.warn = origWarn;
    }

    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      // Allow admin, health, config, cron, bulk-jobs, bulk-jobs-test, and test routes
      if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron') || path.startsWith('/api/bulk-jobs') || path.startsWith('/api/test-'))) {
        // Hard override via env (for emergencies)
        if (process.env.MAINTENANCE_HARD_READONLY === '1') {
          return new NextResponse(JSON.stringify({ ok:false, maintenance:true, message:'Maintenance mode (env) — writes paused' }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
        try {
          const cfgUrl = new URL('/api/config?key=maintenance', req.url);
          const r = await fetch(cfgUrl.toString(), { cache: 'no-store' });
          const j = await r.json();
          const m = j?.config?.maintenance;
          if (m?.enabled) {
            const msg = String(m?.message || 'Maintenance mode — writes paused');
            return new NextResponse(JSON.stringify({ ok:false, maintenance:true, message: msg }), { status: 503, headers: { 'content-type': 'application/json' } });
          }
        } catch { /* allow on failure */ }
      }
    }
  } else {
    // Handle page routes (first visit + pageview_server)
    response = NextResponse.next();
    const method = req.method.toUpperCase();
    const accept = req.headers.get('accept');
    const secFetchDest = req.headers.get('sec-fetch-dest');
    const userAgent = req.headers.get('user-agent') || '';
    const referrer = req.headers.get('referer') || undefined;
    const fullPath = path + (req.nextUrl.search || '');
    const utm = getUtmFromUrl(req.nextUrl.search || '');
    const deviceType = getDeviceTypeFromUA(userAgent);

    const excluded = isExcludedPath(path);
    const realHtml = isRealHtmlNavigation(method, accept, secFetchDest);
    const bot = isBot(userAgent);
    const shouldSetVisitor = !excluded && !bot;
    const shouldTrack = shouldSetVisitor && realHtml;

    if (shouldSetVisitor) {
      let visitorId = req.cookies.get('visitor_id')?.value;
      const isFirstVisit = !visitorId;
      if (isFirstVisit) {
        visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        response.cookies.set('visitor_id', visitorId, {
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
          httpOnly: false,
          sameSite: 'lax',
        });
      }

      if (shouldTrack) {
        const hasAuthCookie = req.cookies.getAll().some(
          (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
        );
        const firstVisitProps = {
          is_bot: false,
          path: fullPath,
          landing_page: fullPath,
          referrer,
          user_agent: userAgent.slice(0, 200),
          timestamp: new Date().toISOString(),
          device_type: deviceType,
          ...utm,
        };
        if (isFirstVisit) {
          try {
            await captureServer('user_first_visit', firstVisitProps, visitorId);
          } catch (e) {
            if (process.env.NODE_ENV === 'development') console.error('Failed to track first visit:', e);
          }
        }
        const pvLastRaw = req.cookies.get(PV_LAST_COOKIE)?.value;
        const pvLast = parsePvLast(pvLastRaw);
        const now = Date.now();
        const skipPv = pvLast && pvLast.path === fullPath && now - pvLast.ts < PV_RATE_LIMIT_MS;
        if (!skipPv) {
          try {
            await captureServer('pageview_server', {
              path: fullPath,
              referrer,
              visitor_id: visitorId,
              is_authenticated: !!hasAuthCookie,
              timestamp: new Date().toISOString(),
              ...utm,
            }, visitorId);
            response.cookies.set(PV_LAST_COOKIE, formatPvLast(fullPath, now), {
              path: '/',
              maxAge: PV_LAST_MAX_AGE,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            });
          } catch (e) {
            if (process.env.NODE_ENV === 'development') console.error('Failed to track pageview_server:', e);
          }
        }
      }
    }
  }

  // Generate guest token for unauthenticated users (for both API and page routes)
  // Check if user has auth cookie - if not, they're a guest
  const hasAuthCookie = req.cookies.getAll().some(cookie => 
    cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  );
  
  if (!hasAuthCookie && response) {
    const guestToken = req.cookies.get('guest_session_token')?.value;
    if (!guestToken) {
      // Generate new guest token
      try {
        const { generateGuestToken } = await import('./lib/guest-tracking');
        // Extract IP and User-Agent directly from NextRequest headers
        const forwarded = req.headers.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
        const userAgent = req.headers.get('user-agent') || 'unknown';
        const newToken = await generateGuestToken(ip, userAgent);
        
        response.cookies.set('guest_session_token', newToken, {
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
          httpOnly: true, // Prevent client-side access
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        });
      } catch (error) {
        // Fail silently - guest token generation is best-effort
        if (process.env.NODE_ENV === 'development') {
          console.error('[Middleware] Failed to generate guest token:', error);
        }
      }
    }
  } else if (response && hasAuthCookie) {
    // Authenticated user - remove guest token if present
    if (req.cookies.get('guest_session_token')) {
      response.cookies.delete('guest_session_token');
    }
  }

  // Sitemap: prevent caching so Google always gets fresh content
  const res = response || NextResponse.next();
  if (path === '/sitemap.xml' || path.startsWith('/sitemap')) {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Content-Type', 'application/xml');
  }

  return res;
}
