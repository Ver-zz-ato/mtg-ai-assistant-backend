import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getPosthogQueryCredentials, posthogHogql } from "@/lib/server/posthog-hogql";
import { SCAN_EVENTS } from "@/lib/scanner/analytics-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sqlIntDays(raw: string | null): number {
  const n = parseInt(raw || "7", 10);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, n));
}

function eventListInClause(): string {
  return SCAN_EVENTS.map((e) => `'${e}'`).join(", ");
}

function rowMapByCols(columns: string[], row: unknown[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  columns.forEach((c, i) => {
    o[c] = row[i];
  });
  return o;
}

/**
 * GET /api/admin/scanner-analytics/overview?days=7
 * Admin-only. Aggregates mobile scanner PostHog events (HogQL).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    if (!getPosthogQueryCredentials()) {
      return NextResponse.json(
        {
          ok: false,
          error: "posthog_not_configured",
          hint:
            "Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (PostHog → Project Settings). Same keys as scripts/audit-phase2/posthog-events.ts.",
        },
        { status: 503 },
      );
    }

    const days = sqlIntDays(req.nextUrl.searchParams.get("days"));
    const intervalClause = `now() - INTERVAL ${days} DAY`;

    const qEventTotals = `
      SELECT
        event,
        count() AS c,
        uniqIf(toString(properties.scan_session_id), properties.scan_session_id IS NOT NULL AND toString(properties.scan_session_id) != '') AS sessions,
        uniqIf(toString(properties.scan_attempt_id), properties.scan_attempt_id IS NOT NULL AND toString(properties.scan_attempt_id) != '') AS attempts
      FROM events
      WHERE event IN (${eventListInClause()})
        AND timestamp >= ${intervalClause}
      GROUP BY event
      ORDER BY c DESC
    `;

    const qAddInitiatedRollup = `
      SELECT
        count() AS total,
        countIf(properties.name_resolution = 'canonical') AS name_canonical,
        countIf(properties.name_resolution = 'fail_open') AS name_fail_open,
        countIf(properties.match_source = 'ai') AS match_ai,
        countIf(properties.match_source = 'ocr') AS match_ocr,
        countIf(properties.match_source = 'direct_search') AS match_direct_search,
        countIf(properties.match_source = 'ai_improve') AS match_ai_improve,
        countIf(
          properties.match_source IS NOT NULL
          AND properties.match_source != ''
          AND properties.match_source NOT IN ('ai', 'ocr', 'direct_search', 'ai_improve')
        ) AS match_other,
        countIf(isNull(properties.match_source) OR toString(properties.match_source) = '') AS match_unset,
        countIf(properties.auto_add_enabled = true) AS auto_add_true,
        countIf(properties.auto_add_enabled = false) AS auto_add_false,
        countIf(isNull(properties.auto_add_enabled)) AS auto_add_unset,
        countIf(properties.will_persist_to_supabase = true) AS persist_true,
        countIf(properties.will_persist_to_supabase = false) AS persist_false,
        countIf(isNull(properties.will_persist_to_supabase)) AS persist_unset,
        countIf(properties.add_confirm_method = 'auto') AS confirm_auto,
        countIf(properties.add_confirm_method = 'manual') AS confirm_manual,
        countIf(
          isNull(properties.add_confirm_method)
          OR toString(properties.add_confirm_method) = ''
        ) AS confirm_unset
      FROM events
      WHERE event = 'scan_card_add_initiated'
        AND timestamp >= ${intervalClause}
    `;

    const qByDimension = (prop: string, label: string) => `
      SELECT
        ifNull(nullIf(toString(properties.${prop}), ''), '(unset)') AS ${label},
        count() AS c
      FROM events
      WHERE event = 'scan_card_add_initiated'
        AND timestamp >= ${intervalClause}
      GROUP BY ${label}
      ORDER BY c DESC
      LIMIT 50
    `;

    const qByEventDimension = (event: string, prop: string, label: string) => `
      SELECT
        ifNull(nullIf(toString(properties.${prop}), ''), '(unset)') AS ${label},
        count() AS c
      FROM events
      WHERE event = '${event}'
        AND timestamp >= ${intervalClause}
      GROUP BY ${label}
      ORDER BY c DESC
      LIMIT 50
    `;

    const qAiBlockedByReason = `
      SELECT
        ifNull(nullIf(toString(properties.reason), ''), '(unset)') AS reason,
        count() AS c
      FROM events
      WHERE event = 'scan_ai_assist_blocked'
        AND timestamp >= ${intervalClause}
      GROUP BY reason
      ORDER BY c DESC
      LIMIT 20
    `;

    const qFallbackFailed = `
      SELECT
        count() AS total,
        countIf(properties.is_network = true) AS is_network_true,
        countIf(properties.is_network = false OR isNull(properties.is_network)) AS is_network_other
      FROM events
      WHERE event = 'scan_ai_fallback_failed'
        AND timestamp >= ${intervalClause}
    `;

    const qFallbackFailedErrors = `
      SELECT
        ifNull(nullIf(toString(properties.error), ''), '(no error property)') AS err,
        count() AS c
      FROM events
      WHERE event = 'scan_ai_fallback_failed'
        AND timestamp >= ${intervalClause}
      GROUP BY err
      ORDER BY c DESC
      LIMIT 12
    `;

    const qAutoAddCanonByFlag = `
      SELECT
        ifNull(toString(properties.auto_add_enabled), '(unset)') AS auto_flag,
        countIf(properties.name_resolution = 'canonical') AS canon,
        countIf(properties.name_resolution = 'fail_open') AS fail_open,
        count() AS n
      FROM events
      WHERE event = 'scan_card_add_initiated'
        AND timestamp >= ${intervalClause}
      GROUP BY auto_flag
      ORDER BY n DESC
    `;

    const qPersistCanon = `
      SELECT
        ifNull(toString(properties.will_persist_to_supabase), '(unset)') AS will_persist,
        countIf(properties.name_resolution = 'canonical') AS canon,
        countIf(properties.name_resolution = 'fail_open') AS fail_open,
        count() AS n
      FROM events
      WHERE event = 'scan_card_add_initiated'
        AND timestamp >= ${intervalClause}
      GROUP BY will_persist
      ORDER BY n DESC
    `;

    const [
      rEvents,
      rAddRollup,
      rNameRes,
      rMatchSrc,
      rConfirmMethod,
      rSourceScreen,
      rAssistMode,
      rAiBlocked,
      rFfAgg,
      rFfErr,
      rAutoCanon,
      rPersistCanon,
    ] = await Promise.all([
      posthogHogql(qEventTotals),
      posthogHogql(qAddInitiatedRollup),
      posthogHogql(qByDimension("name_resolution", "dim")),
      posthogHogql(qByDimension("match_source", "dim")),
      posthogHogql(qByDimension("add_confirm_method", "dim")),
      posthogHogql(qByDimension("source_screen", "dim")),
      posthogHogql(qByEventDimension("scan_ai_fallback_started", "assist_mode", "dim")),
      posthogHogql(qAiBlockedByReason),
      posthogHogql(qFallbackFailed),
      posthogHogql(qFallbackFailedErrors),
      posthogHogql(qAutoAddCanonByFlag),
      posthogHogql(qPersistCanon),
    ]);

    const eventCounts: Record<string, number> = {};
    const eventSessions: Record<string, number> = {};
    const eventAttempts: Record<string, number> = {};
    for (const row of rEvents.results) {
      const ev = String(row[0] ?? "");
      eventCounts[ev] = Number(row[1] ?? 0);
      eventSessions[ev] = Number(row[2] ?? 0);
      eventAttempts[ev] = Number(row[3] ?? 0);
    }

    const rollupCols = rAddRollup.columns;
    const rollupRow = rAddRollup.results[0] || [];
    const rollup = rowMapByCols(rollupCols, rollupRow);

    const pickRollup = (k: string) => Number(rollup[k] ?? 0);

    const totalAddInit = pickRollup("total");
    const nameCanonical = pickRollup("name_canonical");
    const nameFailOpen = pickRollup("name_fail_open");
    const matchUnset = pickRollup("match_unset");

    const toBreakdown = (res: { columns: string[]; results: unknown[][] }) => {
      const keyIdx = res.columns.indexOf("dim");
      const cIdx = res.columns.indexOf("c");
      if (keyIdx < 0 || cIdx < 0) return {};
      const m: Record<string, number> = {};
      for (const row of res.results) {
        m[String(row[keyIdx])] = Number(row[cIdx] ?? 0);
      }
      return m;
    };

    const toKeyedRows = (res: { columns: string[]; results: unknown[][] }, keyCol: string) => {
      const idx = res.columns.indexOf(keyCol);
      const cIdx = res.columns.indexOf("c");
      const out: Record<string, number> = {};
      if (idx < 0 || cIdx < 0) return out;
      for (const row of res.results) {
        out[String(row[idx])] = Number(row[cIdx] ?? 0);
      }
      return out;
    };

    const funnelOrder = [
      { id: "scan_card_screen_viewed", label: "Scanner opened" },
      { id: "scan_card_capture_completed", label: "Capture completed" },
      { id: "scan_card_ocr_completed", label: "OCR completed" },
      { id: "scan_card_match_completed", label: "Match completed" },
      { id: "scan_card_result_selected", label: "Result selected" },
      { id: "scan_card_add_initiated", label: "Add initiated (intent)" },
      { id: "scan_card_add_completed", label: "Add completed (persisted)" },
    ] as const;

    const funnel = funnelOrder.map((step) => ({
      ...step,
      count: eventCounts[step.id] ?? 0,
    }));

    const firstStep = funnel[0]?.count ?? 0;
    const funnelWithPct = funnel.map((s) => ({
      ...s,
      pct_of_first: firstStep > 0 ? Math.round((s.count / firstStep) * 1000) / 10 : null as number | null,
    }));

    const ffCols = rFfAgg.columns;
    const ffRow = rFfAgg.results[0] || [];
    const ffAgg = rowMapByCols(ffCols, ffRow);

    const persistRows = rPersistCanon.results.map((row) => rowMapByCols(rPersistCanon.columns, row));

    return NextResponse.json({
      ok: true,
      meta: {
        days,
        window: `last ${days} days (UTC)`,
        source: "posthog_hogql",
        events: [...SCAN_EVENTS],
      },
      overview: {
        scanner_starts: eventCounts.scan_card_screen_viewed ?? 0,
        scan_add_initiated: eventCounts.scan_card_add_initiated ?? 0,
        scan_add_completed: eventCounts.scan_card_add_completed ?? 0,
        canonical_resolution_rate:
          totalAddInit > 0 ? Math.round((nameCanonical / totalAddInit) * 1000) / 10 : null,
        fail_open_rate: totalAddInit > 0 ? Math.round((nameFailOpen / totalAddInit) * 1000) / 10 : null,
        name_resolution_unaccounted: Math.max(
          0,
          totalAddInit - nameCanonical - nameFailOpen,
        ),
        ai_assist_usage_rate:
          totalAddInit > 0
            ? Math.round((pickRollup("match_ai") / totalAddInit) * 1000) / 10
            : null,
        ai_assist_blocked: eventCounts.scan_ai_assist_blocked ?? 0,
        auto_add_usage_rate:
          totalAddInit > 0
            ? Math.round((pickRollup("auto_add_true") / totalAddInit) * 1000) / 10
            : null,
        match_pipeline_hint:
          (eventCounts.scan_card_match_completed ?? 0) > 0
            ? Math.round(
                ((eventCounts.scan_ai_fallback_started ?? 0) /
                  (eventCounts.scan_card_match_completed ?? 1)) *
                  1000,
              ) / 10
            : null,
        match_source_unset_count: matchUnset,
        add_initiated_rollups: {
          total: totalAddInit,
          name_canonical: nameCanonical,
          name_fail_open: nameFailOpen,
          match_ai: pickRollup("match_ai"),
          match_ai_improve: pickRollup("match_ai_improve"),
          match_ocr: pickRollup("match_ocr"),
          match_direct_search: pickRollup("match_direct_search"),
          match_other: pickRollup("match_other"),
          match_unset: matchUnset,
          auto_add_true: pickRollup("auto_add_true"),
          auto_add_false: pickRollup("auto_add_false"),
          auto_add_unset: pickRollup("auto_add_unset"),
          persist_true: pickRollup("persist_true"),
          persist_false: pickRollup("persist_false"),
          persist_unset: pickRollup("persist_unset"),
          confirm_auto: pickRollup("confirm_auto"),
          confirm_manual: pickRollup("confirm_manual"),
          confirm_unset: pickRollup("confirm_unset"),
        },
        event_counts: eventCounts,
        event_sessions: eventSessions,
        event_attempts: eventAttempts,
      },
      funnel: funnelWithPct,
      quality: {
        by_name_resolution: toBreakdown(rNameRes),
        by_match_source: toBreakdown(rMatchSrc),
        by_add_confirm_method: toBreakdown(rConfirmMethod),
        by_source_screen: toBreakdown(rSourceScreen),
      },
      aiAssist: {
        blocked_total: eventCounts.scan_ai_assist_blocked ?? 0,
        blocked_by_reason: toKeyedRows(rAiBlocked, "reason"),
        fallback_started: eventCounts.scan_ai_fallback_started ?? 0,
        fallback_success: eventCounts.scan_ai_fallback_success ?? 0,
        fallback_failed: eventCounts.scan_ai_fallback_failed ?? 0,
        improve_clicked: eventCounts.scan_ai_improve_clicked ?? 0,
        improve_blocked: eventCounts.scan_ai_improve_blocked ?? 0,
        improve_success: eventCounts.scan_ai_improve_success ?? 0,
        fallback_by_assist_mode: toBreakdown(rAssistMode),
        fallback_failed_agg: {
          total: Number(ffAgg.total ?? 0),
          is_network_true: Number(ffAgg.is_network_true ?? 0),
          is_network_other: Number(ffAgg.is_network_other ?? 0),
        },
        fallback_failed_top_errors: rFfErr.results.map((row) => ({
          error: String(row[0] ?? ""),
          count: Number(row[1] ?? 0),
        })),
      },
      autoAdd: {
        usage_counts: {
          auto_true: pickRollup("auto_add_true"),
          auto_false: pickRollup("auto_add_false"),
          auto_unset: pickRollup("auto_add_unset"),
        },
        canonical_by_auto_flag: rAutoCanon.results.map((row) => {
          const o = rowMapByCols(rAutoCanon.columns, row);
          const n = Number(o.n ?? 0);
          const canon = Number(o.canon ?? 0);
          const fo = Number(o.fail_open ?? 0);
          return {
            auto_add_enabled: String(o.auto_flag ?? ""),
            count: n,
            canonical: canon,
            fail_open: fo,
            canonical_rate_pct: n > 0 ? Math.round((canon / n) * 1000) / 10 : null,
            fail_open_rate_pct: n > 0 ? Math.round((fo / n) * 1000) / 10 : null,
          };
        }),
      },
      newDeckPath: {
        note:
          "Events with will_persist_to_supabase=false include the new-deck flow (intent only until deck is saved). Do not treat add_initiated as DB-persisted adds.",
        by_will_persist: persistRows.map((o) => {
          const n = Number(o.n ?? 0);
          const canon = Number(o.canon ?? 0);
          const fo = Number(o.fail_open ?? 0);
          return {
            will_persist_to_supabase: String(o.will_persist ?? ""),
            count: n,
            canonical: canon,
            fail_open: fo,
            canonical_rate_pct: n > 0 ? Math.round((canon / n) * 1000) / 10 : null,
            fail_open_rate_pct: n > 0 ? Math.round((fo / n) * 1000) / 10 : null,
          };
        }),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
