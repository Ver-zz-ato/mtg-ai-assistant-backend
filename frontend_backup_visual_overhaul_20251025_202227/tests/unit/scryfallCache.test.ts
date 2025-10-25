// tests/unit/scryfallCache.test.ts
import { isStale } from "../../lib/server/scryfallTtl";

function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

async function main() {
  const now = new Date();
  const fresh = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10d
  const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40d

  assert(isStale(old, 30) === true, 'expected 40d old to be stale for ttl=30');
  assert(isStale(fresh, 30) === false, 'expected 10d old to be fresh for ttl=30');
  assert(isStale(undefined as any, 30) === true, 'missing timestamp should be stale');
  console.log('OK scryfallCache TTL tests');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
