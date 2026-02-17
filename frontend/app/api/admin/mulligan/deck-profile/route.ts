import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/server-admin";
import { buildDeckProfileWithTypes } from "@/lib/mulligan/deck-profile";

export const runtime = "nodejs";

const Schema = z.object({
  deck: z.object({
    cards: z.array(z.object({ name: z.string(), count: z.number() })),
    commander: z.string().nullable().optional(),
  }),
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

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { deck } = parsed.data;
  const profile = await buildDeckProfileWithTypes(deck.cards, deck.commander ?? null);
  return NextResponse.json({ ok: true, profile });
}
