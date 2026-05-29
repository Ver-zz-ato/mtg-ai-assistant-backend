import { NextRequest, NextResponse } from "next/server";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import {
  aiFeedbackBodySchema,
  submitAiFeedback,
} from "@/lib/ai/submit-ai-feedback";

export async function POST(req: NextRequest) {
  const burst = checkRateLimit(req, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyGenerator: (request) => `ai_feedback:${extractIP(request)}`,
  });
  if (!burst.allowed) {
    return addRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "rate_limited", retryAfter: burst.retryAfter },
        { status: 429 },
      ),
      burst,
    );
  }

  const { user } = await getUserAndSupabase(req);
  const raw = await req.json().catch(() => ({}));
  const parsed = aiFeedbackBodySchema.safeParse(raw);
  if (!parsed.success) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "invalid_feedback_payload" }, { status: 400 }),
      burst,
    );
  }

  const result = await submitAiFeedback({
    req,
    user,
    body: parsed.data,
  });

  if (!result.ok) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: result.error }, { status: result.status }),
      burst,
    );
  }

  return addRateLimitHeaders(
    NextResponse.json({ ok: true, id: result.id, duplicate: result.duplicate ?? false }),
    burst,
  );
}
