import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const JOBS = {
  bulk_price_import: {
    renderPath: "/bulk-price-import",
    internalPath: "/api/cron/bulk-price-import",
  },
  price_snapshot_bulk: {
    renderPath: "/price-snapshot",
    internalPath: "/api/bulk-jobs/price-snapshot",
  },
} as const;

type JobKey = keyof typeof JOBS;

function getCronKey(): string {
  return process.env.CRON_KEY || process.env.CRON_SECRET || process.env.RENDER_CRON_SECRET || "";
}

function getBulkJobsBaseUrl(): string {
  return (
    process.env.BULK_JOBS_URL ||
    process.env.BULK_JOBS_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const job = String(body?.job || "").trim() as JobKey;
    if (!JOBS[job]) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_job",
          allowed: Object.keys(JOBS),
        },
        { status: 400 }
      );
    }

    const { renderPath, internalPath } = JOBS[job];
    const base = getBulkJobsBaseUrl();
    const cronKey = getCronKey();

    let res: Response;

    if (base && cronKey) {
      const url = `${base}${renderPath}`;
      res = await fetch(url, {
        method: "POST",
        headers: {
          "x-cron-key": cronKey,
          "Content-Type": "application/json",
          "User-Agent": "Manatap-Admin-EssentialJob/1.0",
        },
      });
    } else {
      const origin = req.nextUrl.origin;
      const cookie = req.headers.get("cookie") || "";
      res = await fetch(`${origin}${internalPath}`, {
        method: "POST",
        headers: {
          cookie,
          "Content-Type": "application/json",
        },
      });
    }

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json_from_worker",
          preview: text.slice(0, 500),
          upstream_status: res.status,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
