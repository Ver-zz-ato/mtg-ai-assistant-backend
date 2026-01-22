import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { captureServer } from './lib/server/analytics';
import { validateEnv } from './lib/env';

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

    // Attach/refresh Supabase cookies; never block on error
    try {
      const supabase = createMiddlewareClient({ req, res: response as NextResponse });
      await supabase.auth.getSession();
    } catch (e: any) {
      // Suppress cookie parsing errors - these are warnings from Supabase's cookie format
      // The error "Failed to parse cookie string" is expected when cookies have base64- prefix
      if (e?.message?.includes('Failed to parse cookie string') || e?.message?.includes('base64-')) {
        // Silently ignore - this is a known Supabase auth helper quirk
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.error('Supabase middleware getSession error:', e);
        }
      }
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
    // Handle page routes (first visit tracking)
    response = NextResponse.next();
    const visitorId = req.cookies.get('visitor_id')?.value;
    
    if (!visitorId) {
      const newVisitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      response.cookies.set('visitor_id', newVisitorId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: 'lax',
      });
      
      // Track via PostHog SDK (no cookie consent needed for server-side tracking)
      try {
        await captureServer('user_first_visit', {
          landing_page: path,
          referrer: req.headers.get('referer') || undefined,
          user_agent: req.headers.get('user-agent')?.slice(0, 200) || undefined,
          timestamp: new Date().toISOString(),
        }, newVisitorId);
      } catch (error) {
        console.error('Failed to track first visit:', error);
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
  
  return response || NextResponse.next();
}
