import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { buildCommanderComparisonQa } from "@/lib/external-deck-meta/comparison";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  commander: z.string().trim().max(120).optional(),
  deckText: z.string().min(10).max(30000),
  qaMode: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
    }
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;
    const burst = checkRateLimit(req, {
      windowMs: 60 * 1000,
      maxRequests: 20,
      keyGenerator: () => `admin-external-commander-compare:${auth.user.id}`,
    });
    if (!burst.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Rate limit exceeded", retryAfter: burst.retryAfter }, { status: 429 }),
        burst
      );
    }
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const result = await buildCommanderComparisonQa(admin, parsed.data);
    return addRateLimitHeaders(NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } }), burst);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
  }
}
