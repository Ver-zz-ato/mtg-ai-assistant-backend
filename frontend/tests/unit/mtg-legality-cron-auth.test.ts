/**
 * Unit tests: shared cron verifier.
 * Run: npx tsx tests/unit/mtg-legality-cron-auth.test.ts
 */
import assert from "node:assert";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const SECRET = "test-cron-secret-hex-123456";

type RequestLikeOptions = {
  authorizationHeader?: string | null;
  xVercelId?: string | null;
};

function makeRequest(options: RequestLikeOptions = {}) {
  const url = new URL("https://example.com/api/cron/mtg-legality-refresh");

  const headers = new Headers();
  if (options.authorizationHeader != null) {
    headers.set("authorization", options.authorizationHeader);
  }
  if (options.xVercelId != null) {
    headers.set("x-vercel-id", options.xVercelId);
  }

  return {
    nextUrl: url,
    headers,
    method: "POST",
  } as unknown as { nextUrl: URL; headers: Headers; method: string };
}

try {
  process.env.CRON_SECRET = "";
  assert.strictEqual(
    verifyCronRequest(makeRequest({ authorizationHeader: "Bearer x" }), {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );

  process.env.CRON_SECRET = SECRET;

  assert.strictEqual(
    verifyCronRequest(makeRequest(), { logUnauthorizedOnFailure: false }),
    false,
  );
  assert.strictEqual(
    verifyCronRequest(makeRequest({ authorizationHeader: "Bearer wrong" }), {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );
  assert.strictEqual(
    verifyCronRequest(makeRequest({ authorizationHeader: `Bearer ${SECRET}extra` }), {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );

  assert.strictEqual(
    verifyCronRequest(makeRequest({ authorizationHeader: `Bearer ${SECRET}` }), {
      logUnauthorizedOnFailure: false,
    }),
    true,
  );

  const queryOnlyRequest = {
    nextUrl: new URL(`https://example.com/api/cron/mtg-legality-refresh?key=${SECRET}`),
    headers: new Headers(),
    method: "POST",
  } as unknown as { nextUrl: URL; headers: Headers; method: string };
  assert.strictEqual(
    verifyCronRequest(queryOnlyRequest, {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );

  assert.strictEqual(
    verifyCronRequest(makeRequest({ xVercelId: "spoofed" }), {
      logUnauthorizedOnFailure: false,
    }),
    false,
  );

  console.log("mtg-legality-cron-auth.test.ts: all assertions passed.");
} finally {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
}

export {};
