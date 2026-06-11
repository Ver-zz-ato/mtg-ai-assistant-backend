import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";
import { fetchRedditSignals } from "@/lib/marketing/fetchRedditSignals";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "Invalid origin. This request must come from the same site." },
        { status: 403 }
      );
    }

    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const result = await fetchRedditSignals(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
