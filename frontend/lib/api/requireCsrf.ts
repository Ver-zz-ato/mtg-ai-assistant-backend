import { NextRequest, NextResponse } from 'next/server';
import { sameOriginOrBearerPresent } from '@/lib/api/csrf';

/** Reject cookie-authenticated mutating requests without valid origin or Bearer token. */
export function rejectUnlessCsrfOrBearer(req: NextRequest): NextResponse | null {
  if (sameOriginOrBearerPresent(req)) return null;
  return NextResponse.json(
    { ok: false, error: 'Forbidden', csrf_error: true },
    { status: 403 },
  );
}
