/**
 * Unit tests: App Store review alert cron auth.
 * Run: npx tsx tests/unit/apple-reviews-cron-auth.test.ts
 */
import assert from "node:assert";
import { verifyAppReviewAlertRequest } from "@/lib/server/verifyAppReviewAlertRequest";

const ORIGINAL_APP_SECRET = process.env.APP_REVIEW_ALERT_SECRET;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const APP_SECRET = "test-app-review-secret-abc";
const CRON_SECRET = "test-cron-secret-xyz";

function makeRequest(authorizationHeader?: string | null) {
  const url = new URL("https://example.com/api/cron/apple-reviews");
  const headers = new Headers();
  if (authorizationHeader != null) {
    headers.set("authorization", authorizationHeader);
  }
  return {
    nextUrl: url,
    headers,
    method: "POST",
  } as unknown as { nextUrl: URL; headers: Headers; method: string };
}

try {
  delete process.env.APP_REVIEW_ALERT_SECRET;
  delete process.env.CRON_SECRET;
  assert.strictEqual(
    verifyAppReviewAlertRequest(makeRequest(`Bearer ${APP_SECRET}`), {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );

  process.env.APP_REVIEW_ALERT_SECRET = APP_SECRET;
  assert.strictEqual(
    verifyAppReviewAlertRequest(makeRequest(`Bearer ${APP_SECRET}`), {
      logUnauthorizedOnFailure: false,
    }),
    true,
  );
  assert.strictEqual(
    verifyAppReviewAlertRequest(makeRequest("Bearer wrong"), {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );

  delete process.env.APP_REVIEW_ALERT_SECRET;
  process.env.CRON_SECRET = CRON_SECRET;
  assert.strictEqual(
    verifyAppReviewAlertRequest(makeRequest(`Bearer ${CRON_SECRET}`), {
      logUnauthorizedOnFailure: false,
    }),
    true,
  );

  console.log("apple-reviews-cron-auth.test.ts: all assertions passed.");
} finally {
  if (ORIGINAL_APP_SECRET === undefined) {
    delete process.env.APP_REVIEW_ALERT_SECRET;
  } else {
    process.env.APP_REVIEW_ALERT_SECRET = ORIGINAL_APP_SECRET;
  }
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
}

export {};
