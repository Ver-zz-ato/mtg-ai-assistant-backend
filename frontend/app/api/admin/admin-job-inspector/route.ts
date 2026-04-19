import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import {
  adminJobAttemptKey,
  adminJobDetailKey,
  adminJobLastSuccessKey,
  adminJobStaleHours,
  computeAdminJobHealth,
  parseAdminJobDetail,
  type AdminJobDetail,
  type AdminJobHealth,
  type AdminJobRunLogRow,
} from "@/lib/admin/adminJobDetail";

export const runtime = "nodejs";

const DEFAULT_JOBS = [
  "deck-costs",
  "commander-aggregates",
  "top-cards",
  "bulk_scryfall",
  "bulk_price_import",
  "price_snapshot_bulk",
  "budget-swaps-update",
  "daily_ops_report",
  "weekly_ops_report",
] as const;

type JobPayload = {
  health: AdminJobHealth;
  lastSuccess: string | null;
  lastAttempt: string | null;
  latest: AdminJobDetail | null;
  history: AdminJobRunLogRow[];
};

type OpsReportRow = {
  id: string;
  report_type: string;
  status: string;
  summary: string;
  details: unknown;
  duration_ms: number | null;
  created_at: string;
};

function opsRowToDetail(row: OpsReportRow, jobId: "daily_ops_report" | "weekly_ops_report"): AdminJobDetail {
  const details = row.details as Record<string, unknown> | null;
  const warnings: string[] = [];
  try {
    const jh = details?.job_health as { stale_jobs?: string[] } | undefined;
    if (jh?.stale_jobs?.length) warnings.push(`Stale: ${jh.stale_jobs.slice(0, 3).join(", ")}`);
  } catch {
    /* ignore */
  }
  const st = row.status as string;
  const ok = st !== "fail";
  const runResult =
    st === "ok" ? "success" : st === "warn" ? "partial" : "failed";
  const sevCount =
    st === "fail" ? 1 : st === "warn" ? 1 : 0;
  const compactLine =
    `${st === "ok" ? "ok" : st === "warn" ? "warn" : "fail"} · ${row.summary.slice(0, 120)}${row.summary.length > 120 ? "…" : ""} · ${row.duration_ms ?? 0}ms`;
  return {
    jobId,
    finishedAt: row.created_at,
    ok,
    runResult,
    compactLine,
    destination: "ops_reports",
    source: "ai_usage, app_config job freshness, seo_pages, …",
    durationMs: row.duration_ms ?? undefined,
    counts: {
      checks_effective: 8,
      severity_hits: sevCount,
      warnings: warnings.length,
    },
    warnings: warnings.length ? warnings : undefined,
    labels: {
      report_type: row.report_type,
      report_id: row.id,
    },
    extra: {
      report_id: row.id,
      status: row.status,
      summary: row.summary,
      details_preview: details ? Object.keys(details).slice(0, 12) : [],
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const sp = req.nextUrl.searchParams.get("jobs");
    const jobIds = (sp ? sp.split(",") : [...DEFAULT_JOBS]).map((s) => s.trim()).filter(Boolean);

    const detailKeys = jobIds.map((k) => adminJobDetailKey(k));
    const attemptKeys = jobIds.map((k) => adminJobAttemptKey(k));
    const lastKeys = jobIds.map((k) => adminJobLastSuccessKey(k)).filter((x): x is string => !!x);

    const { data: cfgRows } = await admin
      .from("app_config")
      .select("key, value")
      .in("key", [...new Set([...detailKeys, ...attemptKeys, ...lastKeys])]);

    const cfg = new Map<string, string>();
    for (const r of cfgRows ?? []) {
      const row = r as { key: string; value: string };
      cfg.set(row.key, row.value);
    }

    let tableMissing = false;
    let tableMessage: string | undefined;

    const logJobIds = jobIds.filter((j) => j !== "daily_ops_report" && j !== "weekly_ops_report");
    const histories = new Map<string, AdminJobRunLogRow[]>();
    try {
      const results = await Promise.all(
        logJobIds.map(async (jobName) => {
          const { data, error: logErr } = await admin
            .from("admin_job_run_log")
            .select("id, job_name, started_at, finished_at, duration_ms, ok, run_result, compact_summary, summary_json")
            .eq("job_name", jobName)
            .order("finished_at", { ascending: false })
            .limit(12);
          if (logErr) {
            if (logErr.message?.includes("does not exist") || logErr.code === "42P01") {
              return { jobName, rows: [] as AdminJobRunLogRow[], err: logErr };
            }
            return { jobName, rows: [] as AdminJobRunLogRow[], err: logErr };
          }
          return {
            jobName,
            rows: (data ?? []) as AdminJobRunLogRow[],
            err: null as typeof logErr,
          };
        })
      );
      for (const r of results) {
        if (r.err && (r.err.message?.includes("does not exist") || r.err.code === "42P01")) {
          tableMissing = true;
          tableMessage =
            "Table admin_job_run_log not found — apply migration db/migrations/099_admin_job_run_log.sql in Supabase.";
          break;
        }
        histories.set(r.jobName, r.rows);
      }
    } catch (e) {
      console.warn("[admin-job-inspector] log fetch:", e);
    }

    const opsDaily: Record<string, unknown>[] = [];
    const opsWeekly: Record<string, unknown>[] = [];
    if (jobIds.includes("daily_ops_report") || jobIds.includes("weekly_ops_report")) {
      try {
        const { data: ops } = await admin
          .from("ops_reports")
          .select("id, report_type, status, summary, details, duration_ms, created_at")
          .order("created_at", { ascending: false })
          .limit(40);
        for (const o of ops ?? []) {
          const t = (o as { report_type: string }).report_type;
          if (t === "daily_ops" && opsDaily.length < 12) opsDaily.push(o as Record<string, unknown>);
          if (t === "weekly_ops" && opsWeekly.length < 12) opsWeekly.push(o as Record<string, unknown>);
        }
      } catch (e) {
        console.warn("[admin-job-inspector] ops_reports:", e);
      }
    }

    const jobs: Record<string, JobPayload> = {};

    for (const jobId of jobIds) {
      if (jobId === "daily_ops_report") {
        const latest = opsDaily[0] as OpsReportRow | undefined;
        const hist = opsDaily.slice(0, 12).map((r) => opsRowToDetail(r as OpsReportRow, "daily_ops_report"));
        const lastSuccess = latest?.created_at ?? null;
        const detail = latest ? opsRowToDetail(latest, "daily_ops_report") : null;
        const health = computeAdminJobHealth(jobId, detail, lastSuccess);
        jobs[jobId] = {
          health,
          lastSuccess,
          lastAttempt: lastSuccess,
          latest: detail,
          history: hist.map((d, i) => ({
            id: `ops-daily-${i}`,
            job_name: jobId,
            started_at: d.finishedAt,
            finished_at: d.finishedAt,
            duration_ms: d.durationMs ?? null,
            ok: d.ok,
            run_result: d.runResult ?? null,
            compact_summary: d.compactLine,
            summary_json: d,
          })),
        };
        continue;
      }
      if (jobId === "weekly_ops_report") {
        const latest = opsWeekly[0] as OpsReportRow | undefined;
        const hist = opsWeekly.slice(0, 12).map((r) => opsRowToDetail(r as OpsReportRow, "weekly_ops_report"));
        const lastSuccess = latest?.created_at ?? null;
        const detail = latest ? opsRowToDetail(latest, "weekly_ops_report") : null;
        const health = computeAdminJobHealth(jobId, detail, lastSuccess);
        jobs[jobId] = {
          health,
          lastSuccess,
          lastAttempt: lastSuccess,
          latest: detail,
          history: hist.map((d, i) => ({
            id: `ops-weekly-${i}`,
            job_name: jobId,
            started_at: d.finishedAt,
            finished_at: d.finishedAt,
            duration_ms: d.durationMs ?? null,
            ok: d.ok,
            run_result: d.runResult ?? null,
            compact_summary: d.compactLine,
            summary_json: d,
          })),
        };
        continue;
      }

      const rawDetail = cfg.get(adminJobDetailKey(jobId));
      const latest = parseAdminJobDetail(rawDetail);
      const attempt = cfg.get(adminJobAttemptKey(jobId)) ?? null;
      const lastKey = adminJobLastSuccessKey(jobId);
      const lastSuccess = lastKey ? cfg.get(lastKey) ?? null : null;

      const lastSuccessEff =
        lastSuccess ||
        (latest?.ok ? latest.finishedAt : null) ||
        null;

      const lastAttempt = attempt || latest?.finishedAt || null;
      const health = computeAdminJobHealth(jobId, latest, lastSuccessEff);

      const history = (histories.get(jobId) ?? []).map((r) => ({
        ...r,
        summary_json: (r.summary_json as unknown as AdminJobDetail) ?? ({} as AdminJobDetail),
      }));

      jobs[jobId] = {
        health,
        lastSuccess: lastSuccessEff,
        lastAttempt,
        latest,
        history,
      };
    }

    return NextResponse.json(
      {
        ok: true,
        jobs,
        tableMissing,
        message: tableMessage,
        staleHoursHint: Object.fromEntries(jobIds.map((j) => [j, adminJobStaleHours(j)])),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
