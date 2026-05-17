import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

type VerifyCronRequestOptions = {
  routePath?: string;
  allowLegacyQueryParam?: boolean;
  logUnauthorizedOnFailure?: boolean;
};

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getCronSecret(): string {
  return String(process.env.CRON_SECRET || "").trim();
}

export function getCronAuthorizationHeaderValue(): string {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    throw new Error("CRON_SECRET is not configured");
  }
  return `Bearer ${cronSecret}`;
}

export function logUnauthorizedCronAttempt(
  req: NextRequest,
  options: { routePath?: string } = {},
): void {
  const routePath = options.routePath || req.nextUrl.pathname;
  console.warn(
    JSON.stringify({
      tag: "cron_auth_failed",
      routePath,
      method: req.method,
      timestamp: new Date().toISOString(),
      hasAuthorizationHeader: !!req.headers.get("authorization"),
      hasLegacyQueryKey: req.nextUrl.searchParams.has("key"),
      hasLegacyCronHeader: !!req.headers.get("x-cron-key"),
    }),
  );
}

export function verifyCronRequest(
  req: NextRequest,
  options: VerifyCronRequestOptions = {},
): boolean {
  const routePath = options.routePath || req.nextUrl.pathname;
  const cronSecret = getCronSecret();

  if (!cronSecret) {
    const payload = {
      tag: "cron_auth_misconfigured",
      routePath,
      timestamp: new Date().toISOString(),
      message: "CRON_SECRET is missing; refusing cron request",
    };
    if (process.env.NODE_ENV === "production") {
      console.error(JSON.stringify(payload));
    } else {
      console.warn(JSON.stringify(payload));
    }
    return false;
  }

  const authorizationHeader = String(req.headers.get("authorization") || "").trim();
  const expectedAuthorization = `Bearer ${cronSecret}`;

  // We intentionally do NOT trust x-vercel-id here. It is not a secret and can be spoofed
  // by any caller that can send custom headers to this route.
  if (authorizationHeader && safeEquals(authorizationHeader, expectedAuthorization)) {
    return true;
  }

  // Temporary compatibility only: query-string secrets leak into logs, browser history,
  // analytics, and referrers. Keep this only long enough to migrate legacy manual callers.
  if (options.allowLegacyQueryParam !== false) {
    const legacyQueryKey = String(req.nextUrl.searchParams.get("key") || "").trim();
    if (legacyQueryKey && safeEquals(legacyQueryKey, cronSecret)) {
      return true;
    }
  }

  if (options.logUnauthorizedOnFailure !== false) {
    logUnauthorizedCronAttempt(req, { routePath });
  }

  return false;
}
