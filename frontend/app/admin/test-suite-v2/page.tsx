"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { V2RunResult, V2RunSummary, ScenarioCategory } from "@/lib/admin/ai-v2/types";

type ScenarioListItem = {
  id: string;
  title: string;
  category: ScenarioCategory;
  description: string;
  tags: string[];
  turnsCount: number;
  expectedBehavior?: string;
};

const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  state_memory: "State / Memory",
  rules_legality: "Rules / Legality",
  deck_intelligence: "Deck Intelligence",
  prompt_contract: "Prompt Contract",
  adversarial: "Adversarial",
  fuzz_formatting: "Fuzz / Formatting",
};

export default function TestSuiteV2Page() {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [summary, setSummary] = useState<V2RunSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ScenarioCategory | "">("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScenariosLoading(true);
    fetch("/api/admin/test-suite-v2/scenarios")
      .then((r) => r.json())
      .then((j) => setScenarios(j.scenarios ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setScenariosLoading(false));
  }, []);

  const filteredScenarios = useMemo(() => {
    let list = scenarios;
    if (categoryFilter) {
      list = list.filter((s) => s.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [scenarios, categoryFilter, search]);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedId) ?? null,
    [scenarios, selectedId]
  );
  const selectedResult = useMemo(
    () => summary?.results?.find((r) => r.scenarioId === selectedId) ?? null,
    [summary, selectedId]
  );

  async function run(ids?: string[]) {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const r = await fetch("/api/admin/test-suite-v2/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { scenarioIds: ids } : {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSummary(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Test Suite V2</h1>
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
          ← Admin
        </Link>
      </div>
      <p className="text-sm text-neutral-500 mb-1">
        Scenario-based evaluation for chat AI: deck memory, rules grounding, deck intelligence, prompt contracts, adversarial cases.
      </p>
      <p className="text-xs text-neutral-500 italic">
        ELI5: Run canned chat scenarios to check if the AI remembers your deck, follows rules, and injects the right prompt blocks — without calling the model.
      </p>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Overview */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-base font-semibold text-neutral-200 mb-3">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label="Total Scenarios" value={scenarios.length} />
          <StatCard
            label="Passed"
            value={summary?.passed ?? "—"}
            ok={summary != null ? summary.passed === summary.total : undefined}
          />
          <StatCard
            label="Failed"
            value={summary?.failed ?? "—"}
            ok={summary != null ? summary.failed === 0 : undefined}
          />
          <StatCard label="Hard Failures" value={summary?.hardFailures ?? "—"} ok={summary?.hardFailures === 0} />
          <StatCard label="Soft Failures" value={summary?.softFailures ?? "—"} />
          <StatCard label="Last Run" value={summary?.lastRunAt ? new Date(summary.lastRunAt).toLocaleString() : "—"} />
        </div>
      </section>

      {/* Run Controls */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-base font-semibold text-neutral-200 mb-3">Run Controls</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => run()}
            disabled={busy || scenarios.length === 0}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium"
          >
            {busy ? "Running…" : "Run All"}
          </button>
          <button
            onClick={() => run(filteredScenarios.map((s) => s.id))}
            disabled={busy || filteredScenarios.length === 0}
            className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 disabled:opacity-50 text-sm font-medium"
          >
            Run Filtered ({filteredScenarios.length})
          </button>
          {summary && summary.failed > 0 && (
            <button
              onClick={() => run(summary.results.filter((r) => !r.pass).map((r) => r.scenarioId))}
              disabled={busy}
              className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
            >
              Rerun Failed ({summary.failed})
            </button>
          )}
          {selectedId && (
            <button
              onClick={() => run([selectedId])}
              disabled={busy}
              className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 disabled:opacity-50 text-sm font-medium"
            >
              Run Selected
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scenarios */}
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">
            Scenarios {scenarios.length > 0 && `(${scenarios.length})`}
          </h2>
          <div className="space-y-2 mb-3">
            <input
              type="text"
              placeholder="Search scenarios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ScenarioCategory | "")}
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {(Object.entries(CATEGORY_LABELS) as [ScenarioCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {scenariosLoading ? (
              <p className="text-sm text-neutral-500 py-4">Loading scenarios…</p>
            ) : filteredScenarios.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">
                {scenarios.length === 0 ? "No scenarios loaded." : "No scenarios match your filters."}
              </p>
            ) : (
            filteredScenarios.map((s) => {
              const res = summary?.results?.find((r) => r.scenarioId === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left rounded-lg border p-2 transition-colors ${
                    selectedId === s.id
                      ? "border-blue-500 bg-blue-950/30"
                      : "border-neutral-700 bg-neutral-800/40 hover:bg-neutral-700/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge pass={res?.pass} />
                    <span className="text-sm font-medium truncate">{s.title}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {CATEGORY_LABELS[s.category]} · {s.turnsCount} turn{s.turnsCount !== 1 ? "s" : ""}
                    {res && !res.pass && res.hardFailures.length > 0 && (
                      <span className="text-red-400 ml-1">· {res.hardFailures.length} hard</span>
                    )}
                  </div>
                </button>
              );
            })
            )}
          </div>
        </section>

        {/* Scenario Details */}
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Scenario Details</h2>
          {selectedScenario ? (
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-neutral-500">Title:</span> {selectedScenario.title}
              </div>
              <div>
                <span className="text-neutral-500">Category:</span> {CATEGORY_LABELS[selectedScenario.category]}
              </div>
              <div>
                <span className="text-neutral-500">Description:</span> {selectedScenario.description}
              </div>
              {selectedScenario.expectedBehavior && (
                <div>
                  <span className="text-neutral-500">Expected:</span> {selectedScenario.expectedBehavior}
                </div>
              )}
              <div>
                <span className="text-neutral-500">Tags:</span> {selectedScenario.tags.join(", ")}
              </div>
              <div>
                <span className="text-neutral-500">Turns:</span> {selectedScenario.turnsCount}
              </div>
            </div>
          ) : (
            <p className="text-neutral-500 text-sm">Select a scenario</p>
          )}
        </section>
      </div>

      {/* Test Results — all scenarios when run */}
      {summary && summary.results.length > 0 && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Test Results</h2>
          <p className="text-xs text-neutral-500 mb-3">
            Click a scenario above to see detailed results. Below: pass/fail for each.
          </p>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-700">
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Scenario</th>
                  <th className="py-2 pr-2">Category</th>
                  <th className="py-2 pr-2">Ms</th>
                  <th className="py-2 pr-2">Hard</th>
                  <th className="py-2 pr-2">Soft</th>
                </tr>
              </thead>
              <tbody>
                {summary.results.map((r) => {
                  const s = scenarios.find((sc) => sc.id === r.scenarioId);
                  return (
                    <tr
                      key={r.scenarioId}
                      className={`border-b border-neutral-800 cursor-pointer hover:bg-neutral-800/50 ${
                        selectedId === r.scenarioId ? "bg-blue-950/20" : ""
                      }`}
                      onClick={() => setSelectedId(r.scenarioId)}
                    >
                      <td className="py-2 pr-2">
                        <StatusBadge pass={r.pass} />
                      </td>
                      <td className="py-2 pr-2 font-medium">{s?.title ?? r.scenarioId}</td>
                      <td className="py-2 pr-2 text-neutral-500">{s ? CATEGORY_LABELS[s.category] : "—"}</td>
                      <td className="py-2 pr-2 text-neutral-500">{r.durationMs}</td>
                      <td className="py-2 pr-2">{r.hardFailures.length > 0 ? <span className="text-red-400">{r.hardFailures.length}</span> : "—"}</td>
                      <td className="py-2 pr-2">{r.softFailures.length > 0 ? <span className="text-amber-400">{r.softFailures.length}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Run Results — detailed view for selected scenario */}
      {summary && selectedResult && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Run Results</h2>
          <div className="space-y-4">
            <div
              className={`rounded-lg border p-3 ${
                selectedResult.pass
                  ? "border-green-700 bg-green-950/30 text-green-200"
                  : "border-red-700 bg-red-950/30 text-red-200"
              }`}
            >
              {selectedResult.pass ? "PASS" : "FAIL"} · {selectedResult.durationMs}ms
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-neutral-500">Deck source:</span> {selectedResult.resolvedDeckSource ?? "—"}
              </div>
              <div>
                <span className="text-neutral-500">Commander:</span> {selectedResult.resolvedCommanderName ?? "—"}
              </div>
              <div>
                <span className="text-neutral-500">Commander status:</span> {selectedResult.resolvedCommanderStatus ?? "—"}
              </div>
              <div>
                <span className="text-neutral-500">Prompt blocks:</span>{" "}
                {selectedResult.promptBlocksDetected.length ? selectedResult.promptBlocksDetected.join(", ") : "—"}
              </div>
            </div>
            {selectedResult.hardFailures.length > 0 && (
              <div>
                <div className="text-sm font-medium text-red-400 mb-1">Hard Failures</div>
                <ul className="list-disc list-inside text-sm text-red-300 space-y-0.5">
                  {selectedResult.hardFailures.map((f, i) => (
                    <li key={i}>
                      {f.message}
                      {f.turnIndex != null && ` (turn ${f.turnIndex})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selectedResult.softFailures.length > 0 && (
              <div>
                <div className="text-sm font-medium text-amber-400 mb-1">Soft Failures</div>
                <ul className="list-disc list-inside text-sm text-amber-300 space-y-0.5">
                  {selectedResult.softFailures.map((f, i) => (
                    <li key={i}>
                      {f.message}
                      {f.turnIndex != null && ` (turn ${f.turnIndex})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selectedResult.promptBlocksMissing.length > 0 && (
              <div>
                <div className="text-sm font-medium text-amber-400">Missing blocks:</div>
                <span className="text-sm">{selectedResult.promptBlocksMissing.join(", ")}</span>
              </div>
            )}
            {selectedResult.promptBlocksForbidden.length > 0 && (
              <div>
                <div className="text-sm font-medium text-red-400">Forbidden blocks present:</div>
                <span className="text-sm">{selectedResult.promptBlocksForbidden.join(", ")}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Prompt View */}
      {summary && selectedResult?.debug?.promptExcerpt && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Prompt View</h2>
          <pre className="p-3 bg-neutral-950 rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap break-words font-mono">
            {selectedResult.debug.promptExcerpt}
          </pre>
        </section>
      )}

      {/* Debug */}
      {summary && selectedResult?.debug && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-3">Debug</h2>
          <details>
            <summary className="text-sm cursor-pointer text-neutral-400 hover:text-white">
              ActiveDeckContext (last turn)
            </summary>
            <pre className="mt-2 p-3 bg-neutral-950 rounded text-xs overflow-auto max-h-48 font-mono">
              {JSON.stringify(selectedResult.debug.activeDeckContext, null, 2)}
            </pre>
          </details>
          {selectedResult.debug.turnResults && selectedResult.debug.turnResults.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm cursor-pointer text-neutral-400 hover:text-white">
                Turn results ({selectedResult.debug.turnResults.length})
              </summary>
              <div className="mt-2 space-y-2">
                {selectedResult.debug.turnResults.map((tr) => (
                  <div key={tr.turnIndex} className="p-2 bg-neutral-950 rounded text-xs font-mono">
                    <div className="font-medium mb-1">Turn {tr.turnIndex}</div>
                    <div>Deck: {JSON.stringify(tr.deckContext)}</div>
                    <div>Blocks: {tr.promptBlocks.join(", ") || "—"}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string | number;
  ok?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`text-lg font-semibold mt-0.5 ${
          ok === true ? "text-green-400" : ok === false ? "text-red-400" : "text-neutral-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ pass }: { pass?: boolean }) {
  if (pass === undefined) return <span className="w-2 h-2 rounded-full bg-neutral-600 shrink-0" />;
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${pass ? "bg-green-500" : "bg-red-500"}`}
      title={pass ? "Passed" : "Failed"}
    />
  );
}
