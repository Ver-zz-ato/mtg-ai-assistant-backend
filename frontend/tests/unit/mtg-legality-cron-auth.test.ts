/**
 * Unit tests: MTG legality refresh cron auth (secret-only, no x-vercel-id trust).
 * Run: npx tsx tests/unit/mtg-legality-cron-auth.test.ts
 */
import assert from "node:assert";
import { isMtgLegalityCronAuthorized } from "@/app/api/_lib/mtg-legality-cron-auth";

const SECRET = "test-cron-secret-hex-123456";

function auth(
  overrides: Partial<{
    authorizationHeader: string | null;
    xCronKey: string | null;
    queryKey: string | null;
  }> = {}
) {
  return isMtgLegalityCronAuthorized([SECRET], {
    authorizationHeader: null,
    xCronKey: null,
    queryKey: null,
    ...overrides,
  });
}

// No configured secrets → never authorize (caller should 401)
assert.strictEqual(
  isMtgLegalityCronAuthorized([], {
    authorizationHeader: "Bearer x",
    xCronKey: null,
    queryKey: null,
  }),
  false
);

// Unauthenticated
assert.strictEqual(auth(), false);
assert.strictEqual(auth({ authorizationHeader: null, xCronKey: "", queryKey: "" }), false);

// Wrong secret variants
assert.strictEqual(auth({ authorizationHeader: "Bearer wrong" }), false);
assert.strictEqual(auth({ xCronKey: "wrong" }), false);
assert.strictEqual(auth({ queryKey: "wrong" }), false);
assert.strictEqual(auth({ authorizationHeader: `Bearer ${SECRET}extra` }), false);

// Correct Bearer (Vercel cron pattern)
assert.strictEqual(auth({ authorizationHeader: `Bearer ${SECRET}` }), true);
assert.strictEqual(auth({ authorizationHeader: `bearer ${SECRET}` }), true);

// Correct x-cron-key / ?key=
assert.strictEqual(auth({ xCronKey: SECRET }), true);
assert.strictEqual(auth({ queryKey: SECRET }), true);

// x-vercel-id is not an input to isMtgLegalityCronAuthorized — no bypass via extra headers here
assert.strictEqual(auth({ authorizationHeader: "Bearer not-the-secret", xCronKey: "" }), false);

console.log("mtg-legality-cron-auth.test.ts: all assertions passed.");
export {};
