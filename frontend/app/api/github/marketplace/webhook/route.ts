import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * No-op webhook for GitHub Marketplace listing submission.
 * Marketplace requires a webhook URL; ManaTap does not use Marketplace events.
 * Accepts POST, returns 200. No parsing, storage, or verification.
 */
export async function POST(_req: Request) {
  return NextResponse.json({ ok: true });
}
