// frontend/lib/api/csrf.ts
import type { NextRequest } from "next/server";

export function sameOriginOk(req: NextRequest): boolean {
  try {
    const origin = req.headers.get("origin") || "";
    const referer = req.headers.get("referer") || "";
    const reqOrigin = req.nextUrl?.origin || "";
    const hostOnly = (u: string) => { try { const h = new URL(u).host.toLowerCase(); return h.replace(/^www\./,'').split(':')[0]; } catch { return ''; } };
    const reqHost = hostOnly(reqOrigin);
    const originHost = origin ? hostOnly(origin) : '';
    const refererHost = referer ? hostOnly(referer) : '';
    if (!origin && !referer) return true; // non-browser clients
    // Allow if origin host matches request host, or matches configured base host (support www./subdomain variations)
    const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.RENDER_EXTERNAL_URL || "";
    const envHost = envBase ? hostOnly(envBase) : '';
    const allowHosts = [reqHost, envHost].filter(Boolean);
    const okByHost = allowHosts.some((h)=> !!h && (originHost===h || refererHost===h || originHost.endsWith('.'+h) || refererHost.endsWith('.'+h)));
    if (okByHost) return true;
    // Fallback: permit if origin/referer share the same scheme+host prefix as reqOrigin/envBase
    const allow = [reqOrigin, envBase].filter(Boolean);
    return allow.some((b) => origin.startsWith(b) || referer.startsWith(b));
  } catch {
    return true;
  }
}
