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
  
  // Handle API routes (Supabase auth + maintenance mode)
  if (path.startsWith('/api/')) {
    const res = NextResponse.next();

    // Attach/refresh Supabase cookies; never block on error
    try {
      const supabase = createMiddlewareClient({ req, res });
      await supabase.auth.getSession();
    } catch (e) {
      console.error('Supabase middleware getSession error:', e);
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

    return res;
  }
  
  // Handle page routes (first visit tracking without cookie consent)
  const visitorId = req.cookies.get('visitor_id')?.value;
  if (!visitorId) {
    const newVisitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const response = NextResponse.next();
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
    
    return response;
  }
  
  return NextResponse.next();
}
