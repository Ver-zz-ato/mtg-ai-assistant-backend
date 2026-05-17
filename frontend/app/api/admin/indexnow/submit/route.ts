import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { submitToIndexNow } from "@/lib/seo/indexnow";
import { logUnauthorizedCronAttempt, verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (verifyCronRequest(req, { routePath: "/api/admin/indexnow/submit", logUnauthorizedOnFailure: false })) {
    return true;
  }

  const adminToken = String(req.headers.get("x-admin-token") || "").trim();
  const expectedAdminToken = String(process.env.ADMIN_TOKEN || "").trim();
  if (expectedAdminToken && adminToken === expectedAdminToken) {
    return true;
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!(user && isAdmin(user));
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      logUnauthorizedCronAttempt(req, { routePath: "/api/admin/indexnow/submit" });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const urls = body?.urls;
    if (!(typeof urls === "string" || Array.isArray(urls))) {
      return NextResponse.json({ ok: false, error: "urls must be a string or string array" }, { status: 400 });
    }

    const result = await submitToIndexNow(urls);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[indexnow] admin submit failed", message);
    return NextResponse.json({ ok: false, error: "indexnow_submit_failed", message }, { status: 500 });
  }
}
