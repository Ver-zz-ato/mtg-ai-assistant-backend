// frontend/lib/api/csrf.ts
import type { NextRequest } from "next/server";

export function sameOriginOk(req: NextRequest): boolean {
  try {
    const origin = req.headers.get("origin") || "";
    const referer = req.headers.get("referer") || "";
    const reqOrigin = req.nextUrl?.origin || "";
    const reqHost = (()=>{ try { return new URL(reqOrigin).host; } catch { return ''; } })();
    const originHost = (()=>{ try { return origin ? new URL(origin).host : ''; } catch { return ''; } })();
    const refererHost = (()=>{ try { return referer ? new URL(referer).host : ''; } catch { return ''; } })();
    if (!origin && !referer) return true; // non-browser clients
    // Allow if origin matches request origin host, or allowed base URL from env (supports Render/other hosts)
    const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.RENDER_EXTERNAL_URL || "";
    const allowHosts = [reqHost];
    if (envBase) { try { allowHosts.push(new URL(envBase).host); } catch {} }
    const okByHost = allowHosts.some((h)=> !!h && (originHost===h || refererHost===h));
    if (okByHost) return true;
    // Fallback strict origin prefix match
    const allow = [reqOrigin, envBase].filter(Boolean);
    return allow.some((b) => origin.startsWith(b) || referer.startsWith(b));
  } catch {
    return true;
  }
}
