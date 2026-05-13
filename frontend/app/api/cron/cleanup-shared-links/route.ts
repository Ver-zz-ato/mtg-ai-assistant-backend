import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 60;

type CleanupTarget = {
  table: "roast_permalinks" | "shared_health_reports" | "shared_analysis_reports";
  resourceType: "roast" | "health_report" | "analysis_report";
};

const TARGETS: CleanupTarget[] = [
  { table: "roast_permalinks", resourceType: "roast" },
  { table: "shared_health_reports", resourceType: "health_report" },
  { table: "shared_analysis_reports", resourceType: "analysis_report" },
];

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.CRON_SECRET || process.env.RENDER_CRON_SECRET || "";
  const headerKey = req.headers.get("x-cron-key") || "";
  const queryKey = req.nextUrl.searchParams.get("key") || "";
  const isFromVercel = !!req.headers.get("x-vercel-id");
  return isFromVercel || (!!cronKey && (headerKey === cronKey || queryKey === cronKey));
}

async function cleanupTarget(admin: ReturnType<typeof getAdmin>, target: CleanupTarget, nowIso: string) {
  if (!admin) throw new Error("Admin client not available");

  const { data: expiredRows, error: selectError } = await admin
    .from(target.table)
    .select("id")
    .lt("expires_at", nowIso)
    .limit(1000);

  if (selectError) {
    throw new Error(`${target.table} select failed: ${selectError.message}`);
  }

  const ids = (expiredRows ?? [])
    .map((row: { id?: string | null }) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length === 0) {
    return { table: target.table, resource_type: target.resourceType, selected: 0, comments_deleted: 0, rows_deleted: 0 };
  }

  const { count: commentsDeleted, error: commentsError } = await admin
    .from("shared_item_comments")
    .delete({ count: "exact" })
    .eq("resource_type", target.resourceType)
    .in("resource_id", ids);

  if (commentsError) {
    throw new Error(`${target.table} comments cleanup failed: ${commentsError.message}`);
  }

  const { count: rowsDeleted, error: deleteError } = await admin
    .from(target.table)
    .delete({ count: "exact" })
    .in("id", ids);

  if (deleteError) {
    throw new Error(`${target.table} delete failed: ${deleteError.message}`);
  }

  return {
    table: target.table,
    resource_type: target.resourceType,
    selected: ids.length,
    comments_deleted: commentsDeleted || 0,
    rows_deleted: rowsDeleted || 0,
  };
}

async function handleCleanup(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const results = [];
    for (const target of TARGETS) {
      results.push(await cleanupTarget(admin, target, nowIso));
    }

    return NextResponse.json({
      ok: true,
      cleaned_at: nowIso,
      results,
      rows_deleted: results.reduce((sum, item) => sum + item.rows_deleted, 0),
      comments_deleted: results.reduce((sum, item) => sum + item.comments_deleted, 0),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "cleanup_failed";
    console.error("cleanup_shared_links_failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}
