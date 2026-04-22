import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import {
  isCostAuditDbPersistEnabled,
  persistCostAuditEventsBatch,
} from "@/lib/observability/cost-audit-persist";

export const runtime = "nodejs";

const MAX_EVENTS = 20;

function asRecordArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of v) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      out.push(item as Record<string, unknown>);
    }
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

/**
 * Admin-session only: accept client [CostAudit] lines and persist when VERCEL_COST_AUDIT_DB=1.
 */
export async function POST(req: Request) {
  try {
    if (!isCostAuditDbPersistEnabled()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const events = asRecordArray(body?.events);
    if (!events.length) {
      return NextResponse.json({ ok: false, error: "no_events" }, { status: 400 });
    }

    await persistCostAuditEventsBatch("client", events);
    return NextResponse.json({ ok: true, inserted: events.length });
  } catch (e) {
    console.warn("[CostAudit] ingest error (non-fatal):", e);
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }
}
