import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { CARD_TAG_BACKFILL_JOB_ID, runCardTagRefresh } from "@/lib/data/card-tag-refresh";

export const runtime = "nodejs";
export const maxDuration = 800;

function isAdmin(user: { id?: string; email?: string } | null): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map((value) => value.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  try {
    const summary = await runCardTagRefresh(admin, { jobId: CARD_TAG_BACKFILL_JOB_ID });
    return NextResponse.json({ ...summary, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "card_tag_backfill_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
