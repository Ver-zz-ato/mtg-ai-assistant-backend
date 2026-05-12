import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";

export async function readJsonBody(req: NextRequest): Promise<Record<string, any>> {
  return await req.json().catch(() => ({}));
}

export function confirmationFrom(req: NextRequest, body: Record<string, any>): string {
  return String(
    body?.confirmation ||
      body?.confirm ||
      req.headers.get("x-admin-confirmation") ||
      req.headers.get("x-confirmation") ||
      ""
  ).trim();
}

export function requireTypedConfirmation(
  req: NextRequest,
  body: Record<string, any>,
  phrase: string
): NextResponse | null {
  const got = confirmationFrom(req, body);
  if (got === phrase) return null;
  return NextResponse.json(
    {
      ok: false,
      error: "confirmation_required",
      message: `Type ${phrase} to confirm this admin action.`,
      confirmation: phrase,
    },
    { status: 400 }
  );
}

export async function logAdminAction(input: {
  actorId?: string | null;
  action: string;
  target?: string | number | null;
  payload?: unknown;
}) {
  try {
    const admin = getAdmin();
    if (!admin) return;
    await admin.from("admin_audit").insert({
      actor_id: input.actorId || null,
      action: input.action,
      target: input.target == null ? null : String(input.target),
      payload: input.payload ?? null,
    });
  } catch {
    // Admin audit must never break the underlying operation.
  }
}
