// app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";
import { z } from "zod";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import {
  bodyFromQuickFeedbackPayload,
  isAiFeedbackSource,
  submitAiFeedback,
} from "@/lib/ai/submit-ai-feedback";

const feedbackSchema = z.object({
  email: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().email().max(320).nullable().optional(),
  ),
  rating: z.number().int().min(-1).max(5).optional().nullable(),
  source: z.string().trim().min(1).max(100).optional().nullable(),
  text: z.string().trim().max(2000).optional().default(""),
  route: z.string().trim().max(200).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const burst = checkRateLimit(req, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyGenerator: (request) => `feedback:${extractIP(request)}`,
  });
  if (!burst.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 }),
      burst,
    );
  }

  const parsed = feedbackSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "invalid_feedback_payload" }, { status: 400 }),
      burst,
    );
  }

  const payload = parsed.data;
  const source = payload.source ?? null;
  const text = payload.text.trim();
  if (!text && payload.rating == null) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "feedback_requires_text_or_rating" }, { status: 400 }),
      burst,
    );
  }

  const { supabase, user } = await getUserAndSupabase(req);

  if (isAiFeedbackSource(source)) {
    const feedbackBody = bodyFromQuickFeedbackPayload({
      rating: payload.rating,
      text,
      source,
      route: payload.route,
    });
    const result = await submitAiFeedback({ req, user, body: feedbackBody });
    if (!result.ok) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: result.error }, { status: result.status }),
        burst,
      );
    }
    try {
      const { captureServer } = await import("@/lib/server/analytics");
      await captureServer("feedback_sent", {
        user_id: user?.id ?? null,
        rating: payload.rating,
        ...(source && { source }),
      });
    } catch {}
    return addRateLimitHeaders(NextResponse.json({ ok: true, id: result.id }), burst);
  }

  const row = {
    user_id: user?.id ?? null,
    email: user?.email ?? payload.email ?? null,
    rating: payload.rating ?? null,
    text: text || " ",
  };

  const { error } = await supabase.from("feedback").insert(row);
  if (error) {
    return addRateLimitHeaders(
      NextResponse.json({ ok: false, error: "feedback_submit_failed" }, { status: 400 }),
      burst,
    );
  }
  try {
    const { captureServer } = await import("@/lib/server/analytics");
    await captureServer("feedback_sent", { user_id: row.user_id, rating: row.rating, ...(source && { source }) });
  } catch {}
  return addRateLimitHeaders(NextResponse.json({ ok: true }), burst);
}
