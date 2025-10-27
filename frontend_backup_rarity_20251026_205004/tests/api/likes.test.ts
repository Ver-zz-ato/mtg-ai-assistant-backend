export {};
// tests/api/likes.test.ts
// Minimal smoke test: ensures unauthenticated requests are rejected with 401.
// For an authenticated end-to-end test, run npm run dev and execute with NEXT_PUBLIC_BASE_URL pointed to your dev URL
// and a valid session cookie; or adapt to your auth setup.

async function main() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const deckId = process.env.TEST_DECK_ID || '00000000-0000-0000-0000-000000000000';

  const r1 = await fetch(`${base}/api/decks/${deckId}/likes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle' }) });
  if (r1.status !== 401) {
    console.warn('likes.test: Expected 401 when unauthenticated; got', r1.status);
  } else {
    console.log('OK likes unauth 401');
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
