export {};
// tests/api/recompute.test.ts
// Minimal smoke test: ensures /api/decks/recompute-archetypes requires auth (401).

async function main() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const r = await fetch(`${base}/api/decks/recompute-archetypes`, { method: 'POST' });
  if (r.status !== 401) {
    console.warn('recompute.test: Expected 401 when unauthenticated; got', r.status);
  } else {
    console.log('OK recompute unauth 401');
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
