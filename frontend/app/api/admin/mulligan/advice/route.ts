import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/server-admin";
import { MULLIGAN_ADVICE_FORMATS, runMulliganAdvice } from "@/lib/mulligan/advice-handler";

export const runtime = "nodejs";

const AdviceSchema = z.object({
  modelTier: z.enum(["mini", "full"]),
  format: z.enum(MULLIGAN_ADVICE_FORMATS).optional(),
  playDraw: z.enum(["play", "draw"]),
  mulliganCount: z.number().min(0).max(7),
  hand: z.array(z.string()).min(1).max(7),
  deck: z.object({
    cards: z.array(z.object({ name: z.string(), count: z.number() })),
    commander: z.string().nullable().optional(),
  }),
  simulatedTier: z.enum(["guest", "free", "pro"]).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AdviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { modelTier, playDraw, mulliganCount, hand, deck, simulatedTier } = parsed.data;
  const effectiveTier = simulatedTier ?? "pro";
  const resolvedFormat = parsed.data.format ?? "commander";

  const result = await runMulliganAdvice(
    { modelTier, format: resolvedFormat, playDraw, mulliganCount, hand, deck },
    {
      userId: admin.user.id,
      source: "admin_playground",
      effectiveTier,
    }
  );

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
