// frontend/lib/api/csrf.ts
import type { NextRequest } from "next/server";

export function sameOriginOk(req: NextRequest): boolean {
  try {
    const origin = req.headers.get("origin") || "";
    const referer = req.headers.get("referer") || "";
    const reqOrigin = req.nextUrl?.origin || "";
    if (!origin && !referer) return true; // non-browser clients
    // Allow if origin matches request origin, or allowed base URL from env
    const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "";
    const allow = [reqOrigin, envBase].filter(Boolean);
    return allow.some((b) => origin.startsWith(b) || referer.startsWith(b));
  } catch {
    return true;
  }
}
