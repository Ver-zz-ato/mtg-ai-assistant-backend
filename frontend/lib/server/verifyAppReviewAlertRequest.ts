import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

type VerifyAppReviewAlertRequestOptions = {
  routePath?: string;
  logUnauthorizedOnFailure?: boolean;
};

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Primary secret for manual curl/Postman and dedicated schedulers. */
export function getAppReviewAlertSecret(): string {
  return String(process.env.APP_REVIEW_ALERT_SECRET || "").trim();
}

/**
 * Vercel Cron sends Authorization: Bearer CRON_SECRET.
 * Accept either secret so scheduled runs work without duplicating env values.
 */
function getAcceptedSecrets(): string[] {
  const secrets = new Set<string>();
  const primary = getAppReviewAlertSecret();
  const cron = String(process.env.CRON_SECRET || process.env.CRON_KEY || "").trim();
  if (primary) secrets.add(primary);
  if (cron) secrets.add(cron);
  return [...secrets];
}

export function logUnauthorizedAppReviewAlertAttempt(
  req: NextRequest,
  options: { routePath?: string } = {},
): void {
  const routePath = options.routePath || req.nextUrl.pathname;
  console.warn(
    JSON.stringify({
      tag: "apple_reviews_auth_failed",
      routePath,
      method: req.method,
      timestamp: new Date().toISOString(),
      hasAuthorizationHeader: !!req.headers.get("authorization"),
    }),
  );
}

export function verifyAppReviewAlertRequest(
  req: NextRequest,
  options: VerifyAppReviewAlertRequestOptions = {},
): boolean {
  const routePath = options.routePath || req.nextUrl.pathname;
  const acceptedSecrets = getAcceptedSecrets();

  if (acceptedSecrets.length === 0) {
    console.error(
      JSON.stringify({
        tag: "apple_reviews_auth_misconfigured",
        routePath,
        timestamp: new Date().toISOString(),
        message: "APP_REVIEW_ALERT_SECRET (or CRON_SECRET for Vercel Cron) is missing",
      }),
    );
    return false;
  }

  const authorizationHeader = String(req.headers.get("authorization") || "").trim();
  if (!authorizationHeader.startsWith("Bearer ")) {
    if (options.logUnauthorizedOnFailure !== false) {
      logUnauthorizedAppReviewAlertAttempt(req, { routePath });
    }
    return false;
  }

  const token = authorizationHeader.slice("Bearer ".length);
  const authorized = acceptedSecrets.some((secret) => safeEquals(token, secret));
  if (!authorized && options.logUnauthorizedOnFailure !== false) {
    logUnauthorizedAppReviewAlertAttempt(req, { routePath });
  }
  return authorized;
}
