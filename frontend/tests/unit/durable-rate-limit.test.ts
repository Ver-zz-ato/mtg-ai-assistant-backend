import assert from "node:assert";
import {
  checkDurableRateLimit,
  resetEmergencyRateLimitFallbackForTests,
} from "@/lib/api/durable-rate-limit";

const ORIGINAL_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORIGINAL_SERVICE_ROLE_ALT = process.env.SUPABASE_SERVICE_ROLE;

const fakeSupabase = {} as any;

async function run() {
  resetEmergencyRateLimitFallbackForTests();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE;

  const guestDenied = await checkDurableRateLimit(
    fakeSupabase,
    "guest:abc",
    "/api/chat",
    10,
    1,
    { identity: "guest" },
  );
  assert.strictEqual(guestDenied.allowed, false);
  assert.strictEqual(guestDenied.failureCategory, "missing_service_role");

  const freeDenied = await checkDurableRateLimit(
    fakeSupabase,
    "user:free-hash",
    "/api/deck/analyze",
    5,
    1,
    { identity: "free" },
  );
  assert.strictEqual(freeDenied.allowed, false);
  assert.strictEqual(freeDenied.failureCategory, "missing_service_role");

  const proFallback1 = await checkDurableRateLimit(
    fakeSupabase,
    "user:pro-hash",
    "/api/chat",
    2,
    1,
    { identity: "pro", verifiedUserId: "user-123" },
  );
  assert.strictEqual(proFallback1.allowed, true);
  assert.strictEqual(proFallback1.limitedBy, "emergency_memory");
  assert.strictEqual(proFallback1.count, 1);

  const proFallback2 = await checkDurableRateLimit(
    fakeSupabase,
    "user:pro-hash",
    "/api/chat",
    2,
    1,
    { identity: "pro", verifiedUserId: "user-123" },
  );
  assert.strictEqual(proFallback2.allowed, true);
  assert.strictEqual(proFallback2.count, 2);

  const proFallback3 = await checkDurableRateLimit(
    fakeSupabase,
    "user:pro-hash",
    "/api/chat",
    2,
    1,
    { identity: "pro", verifiedUserId: "user-123" },
  );
  assert.strictEqual(proFallback3.allowed, false);
  assert.strictEqual(proFallback3.limitedBy, "emergency_memory");

  const rpcSuccess = await checkDurableRateLimit(
    fakeSupabase,
    "user:rpc-ok",
    "/api/mobile/card/explain",
    12,
    1,
    {
      identity: "free",
      serviceClientOverride: {
        rpc: async () => ({
          data: [{ allowed: true, remaining: 11, limit_count: 12, count_after: 1 }],
          error: null,
        }),
      } as any,
    },
  );
  assert.strictEqual(rpcSuccess.allowed, true);
  assert.strictEqual(rpcSuccess.limit, 12);
  assert.strictEqual(rpcSuccess.count, 1);

  const rpcFreeDenied = await checkDurableRateLimit(
    fakeSupabase,
    "user:rpc-free",
    "/api/mobile/card/explain",
    12,
    1,
    {
      identity: "free",
      serviceClientOverride: {
        rpc: async () => ({
          data: null,
          error: { message: "rpc unavailable" },
        }),
      } as any,
    },
  );
  assert.strictEqual(rpcFreeDenied.allowed, false);
  assert.strictEqual(rpcFreeDenied.failureCategory, "rpc_error");

  const rpcProFallback = await checkDurableRateLimit(
    fakeSupabase,
    "user:rpc-pro",
    "/api/mobile/card/explain",
    12,
    1,
    {
      identity: "pro",
      verifiedUserId: "user-pro",
      serviceClientOverride: {
        rpc: async () => ({
          data: null,
          error: { message: "rpc unavailable" },
        }),
      } as any,
    },
  );
  assert.strictEqual(rpcProFallback.allowed, true);
  assert.strictEqual(rpcProFallback.limitedBy, "emergency_memory");

  console.log("durable-rate-limit.test.ts: all assertions passed.");
}

run()
  .finally(() => {
    resetEmergencyRateLimitFallbackForTests();
    if (ORIGINAL_SERVICE_ROLE === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE_ROLE;
    }
    if (ORIGINAL_SERVICE_ROLE_ALT === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE;
    } else {
      process.env.SUPABASE_SERVICE_ROLE = ORIGINAL_SERVICE_ROLE_ALT;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

export {};
