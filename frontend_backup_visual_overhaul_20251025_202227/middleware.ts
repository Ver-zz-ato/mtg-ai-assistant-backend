import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export const config = {
  matcher: ['/api/:path*'],
};

export async function middleware(req: NextRequest) {
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
    const url = new URL(req.url);
    const path = url.pathname;
    // Allow admin, health, config, and cron routes
    if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron'))) {
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
