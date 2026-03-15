import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

function isAdmin(user: { id?: string; email?: string } | null): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();

    if (action === "suggestion") {
      const { logSuggestionOutcome } = await import("@/lib/data-moat/log-suggestion-outcome");
      const ok = await logSuggestionOutcome({
        suggestion_id: `test-${Date.now()}`,
        suggested_card: "Test Card (admin test)",
        category: "admin-test",
        accepted: true,
        outcome_source: "admin_test",
      });
      return NextResponse.json({ ok: true, action: "suggestion", success: ok });
    }

    if (action === "meta") {
      const { snapshotMetaSignals } = await import("@/lib/data-moat/snapshot-meta-signals");
      const ok = await snapshotMetaSignals();
      return NextResponse.json({ ok: true, action: "meta", success: ok });
    }

    if (action === "commander") {
      const { snapshotCommanderAggregates } = await import("@/lib/data-moat/snapshot-commander-aggregates");
      const ok = await snapshotCommanderAggregates();
      return NextResponse.json({ ok: true, action: "commander", success: ok });
    }

    if (action === "deck-metrics") {
      const { data: row } = await admin
        .from("deck_context_summary")
        .select("deck_id, summary_json")
        .limit(1)
        .maybeSingle();
      if (!row?.deck_id || !row?.summary_json) {
        return NextResponse.json({
          ok: true,
          action: "deck-metrics",
          success: false,
          message: "No deck_context_summary row found to snapshot",
        });
      }
      const { snapshotDeckMetricsForDeck } = await import("@/lib/data-moat/snapshot-deck-metrics");
      const ok = await snapshotDeckMetricsForDeck(row.deck_id, row.summary_json as Record<string, unknown>);
      return NextResponse.json({
        ok: true,
        action: "deck-metrics",
        success: ok,
        deck_id: row.deck_id,
      });
    }

    return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
