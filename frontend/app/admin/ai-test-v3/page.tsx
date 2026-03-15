"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ELI5, HelpTip } from "@/components/AdminHelp";

const TABS = [
  { id: "overview", label: "Overview", eli5: "The big picture: how many tests, last score, what’s broken." },
  { id: "suites", label: "Suites", eli5: "Five groups of tests. Each group checks something different (instructions, memory, answers, trick questions, old bugs)." },
  { id: "scenarios", label: "Scenarios", eli5: "Every single test in one list. Search and filter." },
  { id: "runs", label: "Runs", eli5: "Each time you run a group you get a “run”. See results and compare two runs." },
  { id: "regressions", label: "Regressions", eli5: "Bugs we saved. We re-run these so they don’t come back." },
  { id: "self-improve", label: "Self-Improve", eli5: "The AI suggests fixes. You say yes or no; nothing changes by itself." },
  { id: "exports", label: "Exports", eli5: "Download results as files for spreadsheets or other tools." },
  { id: "debug", label: "Debug", eli5: "Raw data for developers." },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Suite = { id: string; key: string; title: string; description: string | null; is_model_backed: boolean; is_enabled: boolean };
type Scenario = { id: string; suite_key: string; scenario_key: string; title: string; description: string | null; category: string | null; tags: string[]; is_active: boolean };
type Run = { id: string; suite_key: string; run_mode: string; model_name: string | null; status: string; total: number; passed: number; warned: number; failed: number; hard_failures: number; soft_failures: number; started_at: string; completed_at: string | null };
type RunResult = { id: string; run_id: string; scenario_id: string | null; suite_key: string; scenario_key: string; status: string; score_json: object; hard_failures_json: unknown[]; soft_failures_json: unknown[]; prompt_excerpt: string | null; output_text: string | null; validator_findings_json: unknown[]; debug_json: object };
type Regression = { id: string; title: string; bug_type: string | null; severity: string | null; is_active: boolean; expected_fix_notes: string | null; created_at: string };
type Suggestion = { id: string; run_id: string | null; scope: string; suggestion_text: string; rationale_text: string | null; status: string; reviewer_note: string | null; created_at: string };

function StatCard({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${ok === false ? "text-red-400" : ok === true ? "text-green-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export default function AiTestV3Page() {
  const [tab, setTab] = useState<TabId>("overview");
  const [suites, setSuites] = useState<Suite[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [regressions, setRegressions] = useState<Regression[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [selectedSuiteKey, setSelectedSuiteKey] = useState<string>("v2");
  const [lastRun, setLastRun] = useState<{ run: Run; results: RunResult[]; scenarios: Record<string, unknown> } | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [scenarioSuiteFilter, setScenarioSuiteFilter] = useState("");
  const [compareRunA, setCompareRunA] = useState<string>("");
  const [compareRunB, setCompareRunB] = useState<string>("");
  const [compareResult, setCompareResult] = useState<{ newFailures: string[]; newPasses: string[]; deltas: Array<{ scenario_key: string; statusA: string; statusB: string }> } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, scRes, rRes, regRes, sugRes] = await Promise.all([
        fetch("/api/admin/ai-test-v3/suites"),
        fetch("/api/admin/ai-test-v3/scenarios"),
        fetch("/api/admin/ai-test-v3/runs?limit=30"),
        fetch("/api/admin/ai-test-v3/regressions"),
        fetch("/api/admin/ai-test-v3/suggestions"),
      ]);
      const sJ = await sRes.json();
      const scJ = await scRes.json();
      const rJ = await rRes.json();
      const regJ = await regRes.json();
      const sugJ = await sugRes.json();
      if (sJ.ok) setSuites(sJ.suites ?? []);
      if (scJ.ok) setScenarios(scJ.scenarios ?? []);
      if (rJ.ok) setRuns(rJ.runs ?? []);
      if (regJ.ok) setRegressions(regJ.regressions ?? []);
      if (sugJ.ok) setSuggestions(sugJ.suggestions ?? []);
      if (!sRes.ok || !scRes.ok) setError("Failed to load data");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runSuite = async (suiteKey: string) => {
    setSelectedSuiteKey(suiteKey);
    setRunBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/ai-test-v3/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suiteKey, runMode: "full" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      const runId = j.runId;
      const detailRes = await fetch(`/api/admin/ai-test-v3/runs/${runId}`);
      const detailJ = await detailRes.json();
      if (detailJ.ok) setLastRun({ run: detailJ.run, results: detailJ.results, scenarios: detailJ.scenarios ?? {} });
      setTab("runs");
      if (runId) await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunBusy(false);
    }
  };

  const loadRunDetail = async (runId: string) => {
    const r = await fetch(`/api/admin/ai-test-v3/runs/${runId}`);
    const j = await r.json();
    if (j.ok) setLastRun({ run: j.run, results: j.results, scenarios: j.scenarios ?? {} });
    setTab("runs");
  };

  const doCompare = async () => {
    if (!compareRunA || !compareRunB) return;
    setError(null);
    const r = await fetch(`/api/admin/ai-test-v3/compare?runA=${compareRunA}&runB=${compareRunB}`);
    const j = await r.json();
    if (!r.ok) {
      setError(j?.error ?? "Compare failed");
      return;
    }
    setCompareResult({ newFailures: j.newFailures ?? [], newPasses: j.newPasses ?? [], deltas: j.deltas ?? [] });
  };

  const exportRun = async (runId: string, format: "json" | "csv") => {
    const r = await fetch(`/api/admin/ai-test-v3/runs/${runId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-test-v3-run-${runId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addToRegressions = async (result: RunResult, title: string) => {
    const scenarioRow = result.scenario_id ? (lastRun?.scenarios?.[result.scenario_id] as { scenario_definition_json?: object } | undefined) : undefined;
    const scenarioDef = scenarioRow?.scenario_definition_json ?? (result.debug_json as { scenario_definition_json?: object })?.scenario_definition_json ?? (result.scenario_key ? { v2ScenarioId: result.scenario_key } : {});
    const r = await fetch("/api/admin/ai-test-v3/regressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_run_id: result.run_id,
        source_result_id: result.id,
        title: title || result.scenario_key,
        scenario_definition_json: scenarioDef,
      }),
    });
    const j = await r.json();
    if (j.ok) await load();
  };

  const updateSuggestionStatus = async (id: string, status: string, reviewerNote?: string) => {
    const r = await fetch(`/api/admin/ai-test-v3/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewer_note: reviewerNote }),
    });
    const j = await r.json();
    if (j.ok) await load();
  };

  const filteredScenarios = useMemo(() => {
    let list = scenarios;
    if (scenarioSuiteFilter) list = list.filter((s) => s.suite_key === scenarioSuiteFilter);
    if (scenarioSearch.trim()) {
      const q = scenarioSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.scenario_key.toLowerCase().includes(q) ||
          (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    return list;
  }, [scenarios, scenarioSuiteFilter, scenarioSearch]);

  const lastRunPassRate = lastRun?.run ? (lastRun.run.total ? Math.round((100 * (lastRun.run.passed + lastRun.run.warned)) / lastRun.run.total) : 0) : null;
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending").length;
  const activeRegressions = regressions.filter((r) => r.is_active).length;

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">AI Test V3</h1>
          <p className="text-sm text-neutral-500">
            One place to run checks on the AI, see what passes or fails, and make sure we don’t break things we fixed before. You’re in control—nothing changes unless you say so.
          </p>
        </div>
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
          ← Admin
        </Link>
      </div>

      <ELI5 heading="What is this page?" items={["Run five kinds of tests from one place (V1–V5).", "See what passed or failed. Save bad results so we never forget them. Compare “before vs after” when you change something.", "Download results as JSON or CSV if you need them in another tool.", "The AI can suggest fixes; you approve or reject—nothing happens by itself."]} />

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-700 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded text-sm font-medium ${tab === t.id ? "bg-neutral-600 text-white" : "bg-neutral-800/60 text-neutral-400 hover:text-white"}`}
            title={t.eli5}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}

      {!loading && tab === "overview" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Overview</h2>
          <ELI5 heading="What these numbers mean" items={["Total scenarios: how many tests we have in total.", "Last run pass rate: what % passed last time (or had only small warnings).", "Hard failures: things that must be fixed before we’re happy; warnings: nice-to-fix, not blocking.", "Regressions (active): saved bugs we’re still re-checking so they don’t come back.", "Suggestions pending: improvement ideas waiting for your yes/no."]} />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
            <StatCard label="Total tests" value={scenarios.length} />
            <StatCard label="Last run pass %" value={lastRunPassRate != null ? `${lastRunPassRate}%` : "—"} ok={lastRunPassRate != null && lastRunPassRate >= 90} />
            <StatCard label="Must-fix (last run)" value={lastRun?.run?.hard_failures ?? "—"} ok={lastRun?.run?.hard_failures === 0} />
            <StatCard label="Warnings (last run)" value={lastRun?.run?.soft_failures ?? "—"} />
            <StatCard label="Saved bugs (active)" value={activeRegressions} />
            <StatCard label="Ideas waiting" value={pendingSuggestions} />
          </div>
        </section>
      )}

      {!loading && tab === "suites" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Suites</h2>
          <ELI5 heading="What each suite does" items={["V1: Did we send the right instructions? (doesn’t call the AI).", "V2: Does the system know the deck and the rules? (doesn’t call the AI).", "V3: Does the AI answer correctly and honestly? (sends a question, scores the answer).", "V4: Does the AI fall for trick questions? (sends tricky questions, scores the answer).", "V5: Re-run bugs we saved so they don’t come back."]} />
          <div className="mt-4 space-y-3">
            {suites.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
                <div>
                  <span className="font-medium">{s.title}</span>
                  <span className="ml-2 text-xs text-neutral-500">({s.key})</span>
                  {s.is_model_backed && <span className="ml-2 text-xs bg-amber-900/50 text-amber-300 px-1 rounded">model</span>}
                  {s.description && <p className="text-xs text-neutral-500 mt-1">{s.description}</p>}
                </div>
                <button
                  onClick={() => runSuite(s.key)}
                  disabled={runBusy}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
                >
                  {runBusy && selectedSuiteKey === s.key ? "Running…" : "Run this suite"}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-3">V1, V2, and V5 don’t call the AI. V3 and V4 do—they send a question and score the answer.</p>
        </section>
      )}

      {!loading && tab === "scenarios" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Scenarios</h2>
          <p className="text-sm text-neutral-500 mb-4">Every test we have, in one list. Search or filter by suite to find one.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              placeholder="Search…"
              value={scenarioSearch}
              onChange={(e) => setScenarioSearch(e.target.value)}
              className="bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm w-48"
            />
            <select
              value={scenarioSuiteFilter}
              onChange={(e) => setScenarioSuiteFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm"
            >
              <option value="">All suites</option>
              {suites.map((s) => (
                <option key={s.key} value={s.key}>{s.key}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-700">
                  <th className="p-2">Suite</th>
                  <th className="p-2">Key</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Tags</th>
                </tr>
              </thead>
              <tbody>
                {filteredScenarios.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedScenarioId(selectedScenarioId === s.id ? null : s.id)}
                    className={`border-b border-neutral-800 cursor-pointer ${selectedScenarioId === s.id ? "bg-neutral-700/40" : "hover:bg-neutral-800/40"}`}
                  >
                    <td className="p-2"><span className="rounded bg-neutral-700 px-1">{s.suite_key}</span></td>
                    <td className="p-2 font-mono text-xs">{s.scenario_key}</td>
                    <td className="p-2">{s.title}</td>
                    <td className="p-2">{s.category ?? "—"}</td>
                    <td className="p-2">{s.tags?.slice(0, 3).join(", ") ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedScenarioId && (
            <div className="mt-4 p-4 rounded-lg border border-neutral-600 bg-neutral-950/60">
              <h3 className="font-medium mb-2">Scenario detail</h3>
              {(() => {
                const s = scenarios.find((x) => x.id === selectedScenarioId);
                if (!s) return null;
                return (
                  <>
                    <p><strong>Title:</strong> {s.title}</p>
                    <p><strong>Description:</strong> {s.description ?? "—"}</p>
                    <p><strong>Category:</strong> {s.category ?? "—"}</p>
                    <pre className="mt-2 text-xs overflow-auto max-h-48 bg-neutral-900 p-2 rounded">{JSON.stringify(s, null, 2)}</pre>
                  </>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {!loading && tab === "runs" && (
        <section className="space-y-4">
          <div className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
            <h2 className="text-base font-semibold text-neutral-200 mb-3">Run results</h2>
            <p className="text-sm text-neutral-500 mb-3">What happened when you last ran a suite.</p>
            {lastRun ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
                  <StatCard label="Tests run" value={lastRun.run.total} />
                  <StatCard label="Passed" value={lastRun.run.passed} ok={lastRun.run.failed === 0} />
                  <StatCard label="Warned" value={lastRun.run.warned} />
                  <StatCard label="Failed" value={lastRun.run.failed} ok={lastRun.run.failed === 0} />
                  <StatCard label="Must-fix" value={lastRun.run.hard_failures} ok={lastRun.run.hard_failures === 0} />
                  <StatCard label="Finished at" value={lastRun.run.completed_at ? new Date(lastRun.run.completed_at).toLocaleString() : "—"} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-500 border-b border-neutral-700">
                        <th className="p-2">Test</th>
                        <th className="p-2">Status</th>
                        <th className="p-2" title="Must-fix issues">Must-fix</th>
                        <th className="p-2" title="Warnings">Warnings</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastRun.results.map((r) => (
                        <tr
                          key={r.id}
                          className={`border-b border-neutral-800 ${selectedResultId === r.id ? "bg-neutral-700/40" : ""}`}
                        >
                          <td className="p-2">{r.scenario_key}</td>
                          <td className="p-2">
                            <span className={`rounded px-1 ${r.status === "PASS" ? "bg-green-900/50" : r.status === "WARN" ? "bg-amber-900/50" : "bg-red-900/50"}`}>{r.status}</span>
                          </td>
                          <td className="p-2">{(r.hard_failures_json as unknown[]).length}</td>
                          <td className="p-2">{(r.soft_failures_json as unknown[]).length}</td>
                          <td className="p-2">
                            <button
                              onClick={() => setSelectedResultId(selectedResultId === r.id ? null : r.id)}
                              className="text-blue-400 text-xs mr-2"
                            >
                              Detail
                            </button>
                            <button
                              onClick={() => addToRegressions(r, r.scenario_key)}
                              className="text-amber-400 text-xs"
                              title="Save this failure so we re-run it and don’t let the bug come back"
                            >
                              Save as bug
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedResultId && (() => {
                  const r = lastRun.results.find((x) => x.id === selectedResultId);
                  if (!r) return null;
                  return (
                    <div className="mt-4 p-4 rounded-lg border border-neutral-600 bg-neutral-950/60 text-sm">
                      <h3 className="font-medium mb-2">Result: {r.scenario_key}</h3>
                      <p><strong>Status:</strong> {r.status}</p>
                      {(r.hard_failures_json as unknown[]).length > 0 && (
                        <pre className="mt-2 text-xs bg-red-950/30 p-2 rounded">Hard: {JSON.stringify(r.hard_failures_json, null, 2)}</pre>
                      )}
                      {(r.soft_failures_json as unknown[]).length > 0 && (
                        <pre className="mt-2 text-xs bg-amber-950/30 p-2 rounded">Soft: {JSON.stringify(r.soft_failures_json, null, 2)}</pre>
                      )}
                      {r.prompt_excerpt && <pre className="mt-2 text-xs overflow-auto max-h-32 bg-neutral-900 p-2 rounded">Prompt excerpt: {r.prompt_excerpt.slice(0, 1500)}…</pre>}
                      {r.output_text && <pre className="mt-2 text-xs overflow-auto max-h-32 bg-neutral-900 p-2 rounded">Output: {r.output_text.slice(0, 1500)}…</pre>}
                    </div>
                  );
                })()}
              </>
            ) : (
              <p className="text-neutral-500">Run a suite from the Suites tab to see results here, or load a past run from the list below.</p>
            )}
          </div>

          <div className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
            <h2 className="text-base font-semibold text-neutral-200 mb-3">Run history</h2>
          <p className="text-sm text-neutral-500 mb-2">Past runs. Click Load to see that run’s results above.</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {runs.length === 0 && <p className="text-neutral-500 text-sm">No runs yet.</p>}
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between rounded border border-neutral-700 p-2 text-sm">
                  <span>{run.suite_key} · {run.passed}/{run.total} passed · {new Date(run.started_at).toLocaleString()}</span>
                  <button onClick={() => loadRunDetail(run.id)} className="text-blue-400">Load</button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
            <h2 className="text-base font-semibold text-neutral-200 mb-3">Compare two runs</h2>
            <ELI5 heading="What this does" items={["Pick two runs (A and B) to see what got worse or better.", "New failures = passed in A but failed in B. New passes = failed in A but passed in B."]} />
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              <select value={compareRunA} onChange={(e) => setCompareRunA(e.target.value)} className="bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm">
                <option value="">Run A</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.suite_key} {new Date(r.started_at).toLocaleString()}</option>
                ))}
              </select>
              <select value={compareRunB} onChange={(e) => setCompareRunB(e.target.value)} className="bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm">
                <option value="">Run B</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.suite_key} {new Date(r.started_at).toLocaleString()}</option>
                ))}
              </select>
              <button onClick={doCompare} disabled={!compareRunA || !compareRunB} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm">
                Compare
              </button>
            </div>
            {compareResult && (
              <div className="mt-4 text-sm">
                <p className="text-red-400">New failures (in B): {compareResult.newFailures.length}</p>
                <p className="text-green-400">New passes (in B): {compareResult.newPasses.length}</p>
                {compareResult.deltas.length > 0 && (
                  <pre className="mt-2 text-xs overflow-auto max-h-48 bg-neutral-900 p-2 rounded">{JSON.stringify(compareResult.deltas.slice(0, 30), null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {!loading && tab === "regressions" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Saved bugs (regression library)</h2>
          <ELI5 heading="What this is" items={["When a test fails and we don’t want that to happen again, we save it here. We keep re-running these so if the bug comes back, we see it.", "To add one: go to Runs → open a result → click “Add to regressions”."]} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-700">
                  <th className="p-2">Title</th>
                  <th className="p-2">Bug type</th>
                  <th className="p-2">Severity</th>
                  <th className="p-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {regressions.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-800">
                    <td className="p-2">{r.title}</td>
                    <td className="p-2">{r.bug_type ?? "—"}</td>
                    <td className="p-2">{r.severity ?? "—"}</td>
                    <td className="p-2">{r.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && tab === "self-improve" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Self-Improve</h2>
          <ELI5 heading="Review only" items={["The AI suggests fixes based on failures. You approve or reject each one.", "Nothing is applied by itself—no prompts or code change unless you do it."]} />
          <div className="mt-4 space-y-3">
            {suggestions.length === 0 && <p className="text-neutral-500">No suggestions yet.</p>}
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-lg border border-neutral-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded px-1 bg-neutral-700 text-xs">{s.scope}</span>
                  <span className="rounded px-1 text-xs">{s.status}</span>
                </div>
                <p className="mt-2 text-sm">{s.suggestion_text}</p>
                {s.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => updateSuggestionStatus(s.id, "approved")} className="px-2 py-1 rounded bg-green-800 text-sm">Approve</button>
                    <button onClick={() => updateSuggestionStatus(s.id, "rejected")} className="px-2 py-1 rounded bg-red-800 text-sm">Reject</button>
                    <button onClick={() => updateSuggestionStatus(s.id, "implemented")} className="px-2 py-1 rounded bg-neutral-600 text-sm">Mark implemented</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && tab === "exports" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Exports</h2>
          <ELI5 heading="Download for other tools" items={["JSON: full run and all results (e.g. for another AI or script).", "CSV: one row per test, with status—good for spreadsheets.", "Buttons below use the last run you loaded; the API links give you the full lists."]} />
          <div className="mt-4 flex flex-wrap gap-2">
            {lastRun?.run?.id && (
              <>
                <button onClick={() => exportRun(lastRun.run.id, "json")} className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 text-sm">
                  Export last run (JSON)
                </button>
                <button onClick={() => exportRun(lastRun.run.id, "csv")} className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 text-sm">
                  Export last run (CSV)
                </button>
              </>
            )}
            <a href="/api/admin/ai-test-v3/regressions" className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 text-sm" target="_blank" rel="noreferrer">
              Regressions list (API)
            </a>
            <a href="/api/admin/ai-test-v3/suggestions" className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 text-sm" target="_blank" rel="noreferrer">
              Suggestions list (API)
            </a>
          </div>
        </section>
      )}

      {!loading && tab === "debug" && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Debug</h2>
          <p className="text-sm text-neutral-500 mb-4">Raw data for the last run (for developers or export to other tools).</p>
          <button onClick={() => setDebugOpen(!debugOpen)} className="px-3 py-2 rounded bg-neutral-600 text-sm">
            {debugOpen ? "Hide" : "Show"} raw payloads
          </button>
          {debugOpen && (
            <div className="mt-4 space-y-4">
              {lastRun && (
                <pre className="text-xs overflow-auto max-h-96 bg-neutral-950 p-4 rounded border border-neutral-700">
                  {JSON.stringify({ run: lastRun.run, resultsCount: lastRun.results.length }, null, 2)}
                </pre>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
