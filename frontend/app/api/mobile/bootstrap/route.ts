import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { buildMobileBootstrapPayload } from "@/lib/mobile/bootstrap";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
    }
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform");
    const version = url.searchParams.get("version");

    const payload = await buildMobileBootstrapPayload(admin, { platform, version });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        "Content-Type": "application/json",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
