"use client";
import React from "react";
import { ELI5, HelpTip } from "@/components/AdminHelp";

type TestCase = {
  id: string;
  name: string;
  type: "chat" | "deck_analysis";
  input: any;
  expectedChecks?: any;
  tags?: string[];
  source?: string;
  createdAt?: string;
  quality_score?: number;
  catch_count?: number;
  consistency_score?: number;
  failure_rate?: number;
  run_count?: number;
  pass_count?: number;
  last_passed_at?: string;
};

type TestResult = {
  testCase: TestCase;
  response: {
    text: string;
    promptUsed?: any;
    error?: string;
  };
  validation?: any;
};

function PairwiseComparePanel({
  filteredCases,
  pairwiseResult,
  pairwiseFilter,
  onFilterChange,
  onRun,
}: {
  filteredCases: TestCase[];
  pairwiseResult: any;
  pairwiseFilter: "all" | "disagreements";
  onFilterChange: (v: "all" | "disagreements") => void;
  onRun: () => Promise<void>;
}) {
  const [running, setRunning] = React.useState(false);
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);

  const results = pairwiseResult?.results ?? [];
  const summary = pairwiseResult?.summary ?? {};
  const filtered =
    pairwiseFilter === "disagreements"
      ? results.filter((r: any) => r.winnerByJudge !== r.winnerByValidator)
      : results;

  return (
    <div className="space-y-3">
      <div className="font-medium">Pairwise A/B Compare</div>
      <p className="text-xs opacity-70">
        Winner determined by rubric-based judge (human taste), not validator score. Both stored for analysis.
      </p>
      <button
        onClick={async () => {
          setRunning(true);
          try {
            await onRun();
          } finally {
            setRunning(false);
          }
        }}
        disabled={running || filteredCases.length === 0}
        className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
      >
        {running ? "Running…" : `Run Pairwise (first ${Math.min(5, filteredCases.length)})`}
      </button>

      {pairwiseResult?.ok && (
        <div className="space-y-3 pt-2 border-t border-neutral-700">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-neutral-500 mb-1">By Judge (primary)</div>
              <div>
                A: {summary.winRateAByJudge?.toFixed(1)}% | B: {summary.winRateBByJudge?.toFixed(1)}% | Ties:{" "}
                {summary.tieRateByJudge?.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">By Validator</div>
              <div>
                A: {summary.winRateAByValidator?.toFixed(1)}% | B: {summary.winRateBByValidator?.toFixed(1)}% | Ties:{" "}
                {summary.tieRateByValidator?.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="flex gap-4 text-xs">
            <span>
              <strong>Disagreement rate:</strong> {summary.disagreementRate?.toFixed(1)}%
            </span>
            <span>
              <strong>Avg judge confidence:</strong> {summary.avgJudgeConfidence?.toFixed(2)}
            </span>
          </div>
          {summary.avgRubricScores && (
            <div className="text-xs">
              <div className="text-neutral-500 mb-1">Avg rubric scores</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.avgRubricScores).map(([k, v]) => (
                  <span key={k}>
                    {k}: {(v as number).toFixed(1)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onFilterChange("all")}
              className={`px-2 py-1 text-xs rounded ${pairwiseFilter === "all" ? "bg-neutral-600" : "bg-neutral-700"}`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => onFilterChange("disagreements")}
              className={`px-2 py-1 text-xs rounded ${pairwiseFilter === "disagreements" ? "bg-amber-600" : "bg-neutral-700"}`}
            >
              Disagreements ({results.filter((r: any) => r.winnerByJudge !== r.winnerByValidator).length})
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-auto">
            {filtered.map((r: any, i: number) => {
              const idx = results.indexOf(r);
              const expanded = expandedIdx === idx;
              const isDisagreement = r.winnerByJudge !== r.winnerByValidator;
              return (
                <div
                  key={r.testCase?.id ?? i}
                  className={`p-2 rounded border text-xs ${isDisagreement ? "border-amber-600 bg-amber-950/30" : "border-neutral-700 bg-neutral-900"}`}
                >
                  <div className="flex justify-between items-center">
                    <span>{r.testCase?.name ?? `Case ${i + 1}`}</span>
                    <span>
                      Judge: {r.winnerByJudge} | Validator: {r.winnerByValidator}
                      {isDisagreement && <span className="ml-1 text-amber-400">(disagree)</span>}
                    </span>
                    <button
                      onClick={() => setExpandedIdx(expanded ? null : idx)}
                      className="px-1 py-0.5 rounded bg-neutral-600"
                    >
                      {expanded ? "−" : "+"}
                    </button>
                  </div>
                  {expanded && (
                    <div className="mt-2 pt-2 border-t border-neutral-700 space-y-2">
                      <div>
                        <div className="text-neutral-500">Answer A</div>
                        <pre className="whitespace-pre-wrap text-[10px] max-h-24 overflow-auto">{r.responseA?.slice(0, 500)}…</pre>
                      </div>
                      <div>
                        <div className="text-neutral-500">Answer B</div>
                        <pre className="whitespace-pre-wrap text-[10px] max-h-24 overflow-auto">{r.responseB?.slice(0, 500)}…</pre>
                      </div>
                      {r.judge?.reasons?.length > 0 && (
                        <div>
                          <div className="text-neutral-500">Judge reasons</div>
                          <ul className="list-disc ml-4">
                            {r.judge.reasons.map((x: string, j: number) => (
                              <li key={j}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const DIFFICULTY_PRESETS = [
  { value: "standard", label: "Standard" },
  { value: "strict", label: "Strict (brutal)" },
  { value: "safety_first", label: "Safety-First" },
] as const;

function EvalSetsPanel({
  evalSets,
  expandedId,
  onExpand,
  onRefresh,
  adminFormatKey,
}: {
  evalSets: any[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onRefresh: () => void;
  adminFormatKey: string;
}) {
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<Record<string, any>>({});

  const handleSave = async (s: any) => {
    setSaving(true);
    try {
      const form = editForm[s.id] ?? {};
      const payload = {
        id: s.id,
        min_overall_score: form.min_overall_score ?? s.min_overall_score ?? 80,
        max_critical_violations: form.max_critical_violations ?? s.max_critical_violations ?? 0,
        max_total_violations: form.max_total_violations ?? s.max_total_violations ?? 2,
        min_specificity_score: form.min_specificity_score ?? s.min_specificity_score ?? 70,
        min_actionability_score: form.min_actionability_score ?? s.min_actionability_score ?? 70,
        min_format_legality_score: form.min_format_legality_score ?? s.min_format_legality_score ?? 90,
        require_clarifying_question_when_missing_info: form.require_clarifying_question_when_missing_info ?? s.require_clarifying_question_when_missing_info ?? false,
        require_refusal_on_illegal_request: form.require_refusal_on_illegal_request ?? s.require_refusal_on_illegal_request !== false,
        difficulty_preset: form.difficulty_preset ?? s.difficulty_preset ?? "standard",
      };
      const r = await fetch("/api/admin/ai-test/eval-sets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.ok) {
        onRefresh();
        setEditForm((prev) => {
          const next = { ...prev };
          delete next[s.id];
          return next;
        });
      } else alert(j.error || "Failed to save");
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (s: any) => {
    setRunning(s.id);
    try {
      const r = await fetch("/api/admin/ai-test/run-eval-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eval_set_id: s.id, format_key: adminFormatKey }),
      });
      const j = await r.json();
      if (j.ok) {
        alert(`Run complete. Pass: ${j.summary?.setPassed ? "Yes" : "No"}, Rate: ${j.summary?.passRate}%`);
        onRefresh();
      } else alert(j.error || "Failed");
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setRunning(null);
    }
  };

  const getForm = (s: any) => editForm[s.id] ?? {};
  const setForm = (s: any, updates: any) => {
    setEditForm((prev) => ({
      ...prev,
      [s.id]: { ...(prev[s.id] ?? {}), ...updates },
    }));
  };

  return (
    <div className="space-y-3">
      <div className="font-medium">Golden Eval Sets</div>
      <button onClick={onRefresh} className="px-2 py-1 text-xs rounded bg-neutral-600">Refresh</button>
      <div className="grid gap-2">
        {evalSets.map((s: any) => {
          const expanded = expandedId === s.id;
          const lastRun = s.last_run;
          const meta = lastRun?.meta ?? {};
          const topReasons = (meta.worst_offenders ?? [])
            .flatMap((o: any) => o.reasons ?? [])
            .slice(0, 3);
          const categoryBreakdown = meta.top_failing_categories ?? [];

          return (
            <div key={s.id} className="p-2 bg-neutral-900 rounded border border-neutral-800">
              <div className="flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-neutral-400 ml-2">
                    ({s.test_case_ids?.length || 0} cases, strict={String(s.strict)}, preset: {s.difficulty_preset || "standard"})
                  </span>
                  {lastRun && (
                    <span className={`ml-2 text-xs ${lastRun.pass ? "text-green-400" : "text-red-400"}`}>
                      Last: {lastRun.pass ? "PASS" : "FAIL"} ({meta.pass_rate ?? "?"}%)
                    </span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onExpand(expanded ? null : s.id)}
                    className="px-2 py-1 text-xs rounded bg-neutral-600 hover:bg-neutral-500"
                  >
                    {expanded ? "Collapse" : "Edit / Details"}
                  </button>
                  <button
                    onClick={() => handleRun(s)}
                    disabled={!!running}
                    className="px-2 py-1 text-xs rounded bg-green-700 hover:bg-green-600 disabled:opacity-50"
                  >
                    {running === s.id ? "Running…" : "Run Golden Set"}
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="mt-3 pt-3 border-t border-neutral-700 space-y-4">
                  {/* Last run breakdown */}
                  {lastRun && (
                    <div>
                      <div className="text-xs font-medium text-neutral-300 mb-1">Last run</div>
                      <div className="text-xs space-y-1">
                        {categoryBreakdown.length > 0 && (
                          <div>
                            <span className="text-neutral-500">Top failing categories: </span>
                            {categoryBreakdown.map((c: any) => (
                              <span key={c.category} className="mr-2">
                                {c.category} ({c.count})
                              </span>
                            ))}
                          </div>
                        )}
                        {topReasons.length > 0 && (
                          <div>
                            <span className="text-neutral-500">Top 3 failure reasons: </span>
                            <ol className="list-decimal ml-4">
                              {topReasons.map((r: string, i: number) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {meta.regression_hints?.length > 0 && (
                          <div className="text-amber-400">
                            {meta.regression_hints.map((h: string, i: number) => (
                              <div key={i}>{h}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Gating config form */}
                  <div>
                    <div className="text-xs font-medium text-neutral-300 mb-2">Gating thresholds</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Difficulty preset</label>
                        <select
                          value={getForm(s).difficulty_preset ?? s.difficulty_preset ?? "standard"}
                          onChange={(e) => setForm(s, { difficulty_preset: e.target.value })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        >
                          {DIFFICULTY_PRESETS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Min overall score</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={getForm(s).min_overall_score ?? s.min_overall_score ?? 80}
                          onChange={(e) => setForm(s, { min_overall_score: Number(e.target.value) })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Max critical violations</label>
                        <input
                          type="number"
                          min={0}
                          value={getForm(s).max_critical_violations ?? s.max_critical_violations ?? 0}
                          onChange={(e) => setForm(s, { max_critical_violations: Number(e.target.value) })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Max total violations</label>
                        <input
                          type="number"
                          min={0}
                          value={getForm(s).max_total_violations ?? s.max_total_violations ?? 2}
                          onChange={(e) => setForm(s, { max_total_violations: Number(e.target.value) })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Min specificity</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={getForm(s).min_specificity_score ?? s.min_specificity_score ?? 70}
                          onChange={(e) => setForm(s, { min_specificity_score: Number(e.target.value) })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Min actionability</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={getForm(s).min_actionability_score ?? s.min_actionability_score ?? 70}
                          onChange={(e) => setForm(s, { min_actionability_score: Number(e.target.value) })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-500 mb-0.5">Min format legality</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={getForm(s).min_format_legality_score ?? s.min_format_legality_score ?? 90}
                          onChange={(e) => setForm(s, { min_format_legality_score: Number(e.target.value) })}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={getForm(s).require_clarifying_question_when_missing_info ?? s.require_clarifying_question_when_missing_info ?? false}
                            onChange={(e) => setForm(s, { require_clarifying_question_when_missing_info: e.target.checked })}
                          />
                          <span>Require clarifying Q</span>
                        </label>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={getForm(s).require_refusal_on_illegal_request ?? s.require_refusal_on_illegal_request !== false}
                            onChange={(e) => setForm(s, { require_refusal_on_illegal_request: e.target.checked })}
                          />
                          <span>Require refusal on illegal</span>
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSave(s)}
                      disabled={saving}
                      className="mt-2 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save gating config"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AiTestPage() {
  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [selectedCase, setSelectedCase] = React.useState<TestCase | null>(null);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);
  const [validationResult, setValidationResult] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [runningBatch, setRunningBatch] = React.useState(false);
  const [batchResults, setBatchResults] = React.useState<any[]>([]);
  const [lastEvalRunId, setLastEvalRunId] = React.useState<number | null>(null);
  const [filterTag, setFilterTag] = React.useState<string>("");
  const [filterType, setFilterType] = React.useState<string | null>(null);
  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [testHistory, setTestHistory] = React.useState<any[]>([]);
  const [coverageData, setCoverageData] = React.useState<any>(null);
  const [trendsData, setTrendsData] = React.useState<any>(null);
  const [testSchedules, setTestSchedules] = React.useState<any[]>([]);
  const [showPromptInspector, setShowPromptInspector] = React.useState(false);
  const [validationOptions, setValidationOptions] = React.useState({
    runKeywordChecks: true,
    runLLMFactCheck: true, // Default ON for judge
    runReferenceCompare: true, // Default ON for reference checks
    runSemanticCheck: false, // Semantic similarity (off by default, requires expectedAnswer)
  });
  const [generating, setGenerating] = React.useState(false);
  const [generateDescription, setGenerateDescription] = React.useState("");
  const [generateCount, setGenerateCount] = React.useState(5);
  const [expandedResult, setExpandedResult] = React.useState<number | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [improvementSuggestions, setImprovementSuggestions] = React.useState<any>(null);
  const [applying, setApplying] = React.useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = React.useState<Set<number>>(new Set());
  const [applyAction, setApplyAction] = React.useState<"append" | "prepend" | "replace">("append");
  const [pendingPatches, setPendingPatches] = React.useState<any[]>([]);
  const [selectedPatches, setSelectedPatches] = React.useState<Set<string>>(new Set());
  const [evalRuns, setEvalRuns] = React.useState<any[]>([]);
  const [userFailures, setUserFailures] = React.useState<{ knowledgeGaps: any[]; lowRatings: any[] }>({ knowledgeGaps: [], lowRatings: [] });
  const [showUserFailures, setShowUserFailures] = React.useState(false);
  const [promptVersions, setPromptVersions] = React.useState<{ chat: any[]; deck_analysis: any[] }>({ chat: [], deck_analysis: [] });
  const [activePromptVersions, setActivePromptVersions] = React.useState<{ chat: string | null; deck_analysis: string | null }>({ chat: null, deck_analysis: null });
  const [selectedPromptVersion, setSelectedPromptVersion] = React.useState<{ kind: string; version: any } | null>(null);
  const [showPromptVersions, setShowPromptVersions] = React.useState(false);
  const [selectedRunA, setSelectedRunA] = React.useState<string | null>(null);
  const [selectedRunB, setSelectedRunB] = React.useState<string | null>(null);
  const [comparisonData, setComparisonData] = React.useState<any>(null);
  const [loadingComparison, setLoadingComparison] = React.useState(false);
  const [expandedResults, setExpandedResults] = React.useState<Set<number>>(new Set());
  const [resultSuggestions, setResultSuggestions] = React.useState<Map<number, any>>(new Map());
  const [previewPrompt, setPreviewPrompt] = React.useState<string | null>(null);
  const [currentPromptText, setCurrentPromptText] = React.useState<string>("");
  const [recentAdditions, setRecentAdditions] = React.useState<string[]>([]);
  const [lastPromptVersion, setLastPromptVersion] = React.useState<string | null>(null);
  const [autoMergeEnabled, setAutoMergeEnabled] = React.useState(false);
  const [showManualPromptReplacement, setShowManualPromptReplacement] = React.useState(false);
  const [manualPromptText, setManualPromptText] = React.useState("");
  const [manualPromptKind, setManualPromptKind] = React.useState<"chat" | "deck_analysis">("chat");
  const [manualPromptDescription, setManualPromptDescription] = React.useState("");
  const [creatingPrompt, setCreatingPrompt] = React.useState(false);
  const [adminFormatKey, setAdminFormatKey] = React.useState<"commander" | "standard" | "modern" | "pioneer" | "pauper">("commander");
  const [layerTab, setLayerTab] = React.useState<"base" | "formats" | "modules">("base");
  const [layerKeys, setLayerKeys] = React.useState<{ key: string; updated_at?: string }[]>([]);
  const [selectedLayerKey, setSelectedLayerKey] = React.useState<string>("BASE_UNIVERSAL_ENFORCEMENT");
  const [layerBody, setLayerBody] = React.useState("");
  const [layerSaving, setLayerSaving] = React.useState(false);
  const [composedPreview, setComposedPreview] = React.useState<string | null>(null);
  const [modulesAttachedPreview, setModulesAttachedPreview] = React.useState<string[]>([]);
  const [layerVersions, setLayerVersions] = React.useState<{ id: string; created_at: string }[]>([]);
  const [showLayerSection, setShowLayerSection] = React.useState(false);
  const [suiteToolTab, setSuiteToolTab] = React.useState<"main" | "eval-sets" | "compare" | "mutations" | "cost" | "human-review">("main");
  const [evalSets, setEvalSets] = React.useState<any[]>([]);
  const [expandedEvalSetId, setExpandedEvalSetId] = React.useState<string | null>(null);
  const [pairwiseResult, setPairwiseResult] = React.useState<any>(null);
  const [pairwiseFilter, setPairwiseFilter] = React.useState<"all" | "disagreements">("all");
  const [costReport, setCostReport] = React.useState<any>(null);
  const [humanReviews, setHumanReviews] = React.useState<any[]>([]);

  // Load test cases
  React.useEffect(() => {
    loadTestCases();
    loadPromptVersions();
    loadTestHistory();
    loadTrendsData();
    loadTestSchedules();
  }, []);

  async function loadEvalSets() {
    try {
      const r = await fetch("/api/admin/ai-test/eval-sets", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setEvalSets(j.sets || []);
    } catch (e) {
      console.error("Failed to load eval sets:", e);
    }
  }

  async function loadHumanReviews() {
    try {
      const r = await fetch("/api/admin/ai-test/human-reviews?status=pending&limit=50", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setHumanReviews(j.reviews || []);
    } catch (e) {
      console.error("Failed to load human reviews:", e);
    }
  }

  // Load coverage when test cases are loaded or batch results change
  React.useEffect(() => {
    if (testCases.length > 0 || batchResults.length > 0) {
      loadCoverageData();
    }
  }, [testCases.length, batchResults.length]);

  async function loadTestCases() {
    try {
      const r = await fetch("/api/admin/ai-test/cases?includeFailures=true", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        // Sort by quality score if available
        const cases = (j.testCases || []).sort((a: any, b: any) => {
          const scoreA = a.quality_score || 0;
          const scoreB = b.quality_score || 0;
          return scoreB - scoreA;
        });
        setTestCases(cases);
        if (j.knowledgeGaps || j.lowRatings) {
          setUserFailures({
            knowledgeGaps: j.knowledgeGaps || [],
            lowRatings: j.lowRatings || [],
          });
        }
      }
    } catch (e) {
      console.error("Failed to load test cases:", e);
    }
  }

  async function updateQualityScores() {
    try {
      await fetch("/api/admin/ai-test/quality?update=true");
      loadTestCases(); // Reload to show updated scores
    } catch (e) {
      console.error("Failed to update quality scores:", e);
    }
  }

  async function loadPendingPatches() {
    try {
      const r = await fetch("/api/admin/ai-test/patches?status=pending");
      const j = await r.json();
      if (j?.ok) {
        setPendingPatches(j.patches || []);
      }
    } catch (e) {
      console.error("Failed to load patches:", e);
    }
  }

  async function loadEvalRuns() {
    try {
      const r = await fetch("/api/admin/evals?limit=20");
      const j = await r.json();
      if (j?.ok) {
        setEvalRuns(j.rows || []);
      }
    } catch (e) {
      console.error("Failed to load eval runs:", e);
    }
  }

  async function loadTestHistory() {
    try {
      const r = await fetch("/api/admin/ai-test/history?limit=20");
      const j = await r.json();
      if (j?.ok) {
        setTestHistory(j.history || []);
      }
    } catch (e) {
      console.error("Failed to load test history:", e);
    }
  }

  async function loadCoverageData() {
    try {
      // If we have current batch results, use those for coverage
      if (batchResults.length > 0 && testCases.length > 0) {
        // Calculate coverage from current batch results
        const totalTests = testCases.length;
        const testedTests = batchResults.length;
        const passedTests = batchResults.filter((r: any) => r.validation?.overall?.passed === true).length;
        const failedTests = batchResults.filter((r: any) => r.validation?.overall?.passed === false).length;
        const untestedTests = totalTests - testedTests;
        const passRate = testedTests > 0 ? Math.round((passedTests / testedTests) * 100) : 0;

        // Group by type
        const byType: Record<string, { total: number; passed: number; failed: number; untested: number }> = {};
        testCases.forEach((tc: any) => {
          if (!tc.type) return;
          if (!byType[tc.type]) {
            byType[tc.type] = { total: 0, passed: 0, failed: 0, untested: 0 };
          }
          byType[tc.type].total++;
          const result = batchResults.find((r: any) => r.testCase?.id === tc.id);
          if (result?.validation?.overall?.passed === true) {
            byType[tc.type].passed++;
          } else if (result?.validation?.overall?.passed === false) {
            byType[tc.type].failed++;
          } else {
            byType[tc.type].untested++;
          }
        });

        // Group by tag
        const byTag: Record<string, { total: number; passed: number; failed: number; untested: number }> = {};
        testCases.forEach((tc: any) => {
          (tc.tags || []).forEach((tag: string) => {
            if (!byTag[tag]) {
              byTag[tag] = { total: 0, passed: 0, failed: 0, untested: 0 };
            }
            byTag[tag].total++;
            const result = batchResults.find((r: any) => r.testCase?.id === tc.id);
            if (result?.validation?.overall?.passed === true) {
              byTag[tag].passed++;
            } else if (result?.validation?.overall?.passed === false) {
              byTag[tag].failed++;
            } else {
              byTag[tag].untested++;
            }
          });
        });

        setCoverageData({
          overall: {
            total: totalTests,
            tested: testedTests,
            passed: passedTests,
            failed: failedTests,
            untested: untestedTests,
            passRate,
          },
          byType,
          byTag,
          source: "current_batch",
        });
      } else {
        // Fall back to API for historical data
        const r = await fetch("/api/admin/ai-test/coverage");
        const j = await r.json();
        if (j?.ok) {
          setCoverageData(j.coverage || null);
        }
      }
    } catch (e) {
      console.error("Failed to load coverage data:", e);
    }
  }

  async function loadTrendsData() {
    try {
      const r = await fetch("/api/admin/ai-test/trends?days=30");
      const j = await r.json();
      if (j?.ok) {
        setTrendsData(j.trends || null);
      }
    } catch (e) {
      console.error("Failed to load trends data:", e);
    }
  }

  async function loadTestSchedules() {
    try {
      const r = await fetch("/api/admin/ai-test/schedule");
      const j = await r.json();
      if (j?.ok) {
        setTestSchedules(j.schedules || []);
      }
    } catch (e) {
      console.error("Failed to load test schedules:", e);
    }
  }

  async function loadCurrentPromptText() {
    try {
      const kind = manualPromptKind;
      const r = await fetch(`/api/admin/prompt-versions?kind=${kind}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && j.activePromptText) {
        setManualPromptText(j.activePromptText);
      }
    } catch (e) {
      console.error("Failed to load current prompt:", e);
    }
  }

  async function loadPromptVersions() {
    try {
      const [chatRes, deckRes] = await Promise.all([
        fetch("/api/admin/prompt-versions?kind=chat", { cache: "no-store" }),
        fetch("/api/admin/prompt-versions?kind=deck_analysis", { cache: "no-store" }),
      ]);
      const chatData = await chatRes.json();
      const deckData = await deckRes.json();
      if (chatData?.ok) {
        setPromptVersions((prev) => ({ ...prev, chat: chatData.versions || [] }));
        setActivePromptVersions((prev) => ({ ...prev, chat: chatData.activeVersionId || null }));
        // Load current prompt text from API response
        if (chatData.activePromptText) {
          const newPromptText = chatData.activePromptText;
          const currentVersionId = chatData.activeVersionId;
          
          // Detect recent additions if version changed
          if (lastPromptVersion && lastPromptVersion !== currentVersionId && currentPromptText) {
            // Extract the "AI TEST IMPROVEMENTS" section to highlight
            const improvementsMatch = newPromptText.match(/=== AI TEST IMPROVEMENTS \(Auto-Applied\) ===([\s\S]*?)(?=(?:===|$))/);
            if (improvementsMatch) {
              const improvementsText = improvementsMatch[1].trim();
              // Split by double newlines to get individual additions
              const additions = improvementsText.split(/\n\n+/).filter((s: string) => s.trim().length > 0);
              setRecentAdditions(additions);
            } else {
              setRecentAdditions([]);
            }
          } else if (!lastPromptVersion) {
            // First load - check if there are improvements
            const improvementsMatch = newPromptText.match(/=== AI TEST IMPROVEMENTS \(Auto-Applied\) ===([\s\S]*?)(?=(?:===|$))/);
            if (improvementsMatch) {
              const improvementsText = improvementsMatch[1].trim();
              const additions = improvementsText.split(/\n\n+/).filter((s: string) => s.trim().length > 0);
              setRecentAdditions(additions);
            }
          }
          
          setCurrentPromptText(newPromptText);
          setLastPromptVersion(currentVersionId);
        } else {
          // Fallback: try to find in versions list
          const active = chatData.versions?.find((v: any) => v.id === chatData.activeVersionId);
          if (active) {
            setCurrentPromptText(active.system_prompt);
            setLastPromptVersion(active.id);
          } else {
            setCurrentPromptText("No prompt configured. Create a prompt version to get started.");
            setRecentAdditions([]);
          }
        }
      }
      if (deckData?.ok) {
        setPromptVersions((prev) => ({ ...prev, deck_analysis: deckData.versions || [] }));
        setActivePromptVersions((prev) => ({ ...prev, deck_analysis: deckData.activeVersionId || null }));
      }
    } catch (e) {
      console.error("Failed to load prompt versions:", e);
      setCurrentPromptText("Error loading prompt. Check console for details.");
    }
  }

  React.useEffect(() => {
    loadPendingPatches();
    loadEvalRuns();
    loadPromptVersions();
  }, []);

  async function loadLayerKeys() {
    try {
      const r = await fetch("/api/admin/prompt-layers", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && j.layers) setLayerKeys(j.layers);
    } catch (e) {
      console.error("Failed to load layer keys:", e);
    }
  }
  async function loadLayer(key: string) {
    try {
      const r = await fetch(`/api/admin/prompt-layers?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setSelectedLayerKey(key);
        setLayerBody(j.body ?? "");
      }
    } catch (e) {
      console.error("Failed to load layer:", e);
    }
  }
  async function saveLayer() {
    if (!selectedLayerKey || layerSaving) return;
    setLayerSaving(true);
    try {
      const r = await fetch("/api/admin/prompt-layers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: selectedLayerKey, body: layerBody }),
      });
      const j = await r.json();
      if (j.ok) {
        alert(`Saved ${selectedLayerKey}`);
        loadLayerKeys();
        loadLayerVersions(selectedLayerKey);
      } else alert(j.error || "Save failed");
    } catch (e: any) {
      alert(e?.message || "Save failed");
    } finally {
      setLayerSaving(false);
    }
  }
  async function loadComposedPreview() {
    try {
      const r = await fetch(`/api/admin/ai-test/composed-prompt?formatKey=${encodeURIComponent(adminFormatKey)}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setComposedPreview(j.composed ?? "");
        setModulesAttachedPreview(j.modulesAttached ?? []);
      } else setComposedPreview(null);
    } catch (e) {
      setComposedPreview(null);
    }
  }
  async function loadLayerVersions(key: string) {
    try {
      const r = await fetch(`/api/admin/prompt-layers/versions?key=${encodeURIComponent(key)}&limit=20`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && j.versions) setLayerVersions(j.versions);
    } catch (e) {
      setLayerVersions([]);
    }
  }

  async function runTest(testCase: TestCase) {
    setLoading(true);
    setTestResult(null);
    setValidationResult(null);
    try {
      // Run the test
      const runRes = await fetch("/api/admin/ai-test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCase, formatKey: adminFormatKey }),
      });
      const runData = await runRes.json();
      if (!runData.ok) {
        throw new Error(runData.error || "Test failed");
      }

      setTestResult(runData);

      // Auto-validate if response exists
      if (runData.response?.text && testCase.expectedChecks) {
        const validateRes = await fetch("/api/admin/ai-test/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: runData.response.text,
            testCase,
            options: validationOptions,
          }),
        });
        const validateData = await validateRes.json();
        if (validateData.ok) {
          setValidationResult(validateData.validation);
        }
      }
    } catch (e: any) {
      alert(e?.message || "Failed to run test");
    } finally {
      setLoading(false);
    }
  }

  async function generateTestCases(random = false) {
    if (!random && !generateDescription.trim()) {
      alert("Please enter a description");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/ai-test/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: random ? "" : generateDescription,
          count: random ? Math.floor(Math.random() * 6) + 10 : generateCount, // 10-15 for random
          type: "chat",
          random,
        }),
      });
      const data = await res.json();
      if (data.ok && data.testCases) {
        // Add generated test cases to the list
        setTestCases((prev) => [...prev, ...data.testCases]);
        alert(`Generated ${data.testCases.length} test cases. They've been added to your test list.`);
      } else {
        throw new Error(data.error || "Generation failed");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to generate test cases");
    } finally {
      setGenerating(false);
    }
  }

  async function toggleResultExpansion(idx: number, result: any) {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(idx)) {
      newExpanded.delete(idx);
    } else {
      newExpanded.add(idx);
      // Load suggestions if not already loaded
      if (!resultSuggestions.has(idx) && result.validation?.overall?.passed === false) {
        try {
          const r = await fetch("/api/admin/ai-test/analyze-failures", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchResults: [result] }),
          });
          const j = await r.json();
          if (j.ok && j.analysis?.suggestions) {
            const newMap = new Map(resultSuggestions);
            newMap.set(idx, j.analysis.suggestions);
            setResultSuggestions(newMap);
          }
        } catch (e) {
          console.error("Failed to load suggestions:", e);
        }
      }
    }
    setExpandedResults(newExpanded);
  }

  function previewPromptWithPatches(patches: any[], action: "append" | "prepend" | "replace") {
    if (!currentPromptText) {
      // Load current prompt
      const activeChat = promptVersions.chat.find((v: any) => activePromptVersions.chat === v.id);
      if (activeChat) {
        setCurrentPromptText(activeChat.system_prompt);
      }
    }
    const base = currentPromptText || "";
    const patchText = patches.map((p: any) => p.suggested_text).join("\n\n");
    
    let preview = "";
    if (action === "append") {
      preview = base + "\n\n=== AI TEST IMPROVEMENTS ===\n" + patchText;
    } else if (action === "prepend") {
      preview = "=== AI TEST IMPROVEMENTS ===\n" + patchText + "\n\n" + base;
    } else {
      preview = patchText;
    }
    setPreviewPrompt(preview);
  }

  async function runBatchTests() {
    setRunningBatch(true);
    setBatchResults([]);
    const filtered = getFilteredTestCases();

    try {
      const batchRes = await fetch("/api/admin/ai-test/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCases: filtered,
          suite: `batch-${new Date().toISOString().slice(0, 10)}`,
          validationOptions,
          formatKey: adminFormatKey,
        }),
      });

      const batchData = await batchRes.json();
      if (batchData.ok) {
        setBatchResults(batchData.results || []);
        
        // Save test results to history
        try {
          await fetch("/api/admin/ai-test/save-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              evalRunId: batchData.evalRunId,
              results: batchData.results || [],
              summary: batchData.summary,
            }),
          });
          // Reload history, coverage, and eval runs (so Cost tab can use the new ID)
          loadTestHistory();
          loadCoverageData();
          loadEvalRuns();
        } catch (e) {
          console.error("Failed to save test history:", e);
        }
        
        // Auto-merge passing patches if enabled
        if (autoMergeEnabled && batchData.results) {
          const passingResults = batchData.results.filter((r: any) => r.validation?.overall?.passed === true);
          if (passingResults.length > 0) {
            // Get patches associated with passing tests
            const passingTestIds = passingResults.map((r: any) => r.testCase?.id).filter(Boolean);
            if (passingTestIds.length > 0) {
              try {
                const patchesRes = await fetch("/api/admin/ai-test/patches?status=pending");
                const patchesData = await patchesRes.json();
                if (patchesData?.ok && patchesData.patches) {
                  const passingPatches = patchesData.patches.filter((p: any) => 
                    p.affected_tests && p.affected_tests.some((tid: string) => passingTestIds.includes(tid))
                  );
                  if (passingPatches.length > 0) {
                    // Auto-merge without confirmation when enabled
                    const applyRes = await fetch("/api/admin/ai-test/apply-improvements", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        patchIds: passingPatches.map((p: any) => p.id),
                        kind: "chat",
                        action: "append",
                      }),
                    });
                    const applyData = await applyRes.json();
                    if (applyData.ok) {
                      loadPendingPatches();
                      loadPromptVersions();
                      console.log(`✅ Auto-merged ${passingPatches.length} patch(es). New version: ${applyData.newVersion}`);
                    }
                  }
                }
              } catch (e) {
                console.error("Auto-merge failed:", e);
              }
            }
          }
        }
        if (batchData.evalRunId) {
          setLastEvalRunId(batchData.evalRunId);
        }
      } else {
        console.error("Batch test failed:", batchData.error);
        setBatchResults([]);
      }
    } catch (e: any) {
      console.error("Batch test error:", e);
      setBatchResults([]);
    } finally {
      setRunningBatch(false);
    }
  }

  function getFilteredTestCases(): TestCase[] {
    let filtered = testCases;
    
    if (filterType) {
      filtered = filtered.filter((tc) => tc.type === filterType);
    }
    
    if (filterTag) {
      filtered = filtered.filter((tc) => tc.tags?.includes(filterTag));
    }
    
    if (filterStatus) {
      if (filterStatus === "passed") {
        filtered = filtered.filter((tc) => {
          const result = batchResults.find((r: any) => r.testCase?.id === tc.id);
          return result?.validation?.overall?.passed === true;
        });
      } else if (filterStatus === "failed") {
        filtered = filtered.filter((tc) => {
          const result = batchResults.find((r: any) => r.testCase?.id === tc.id);
          return result?.validation?.overall?.passed === false;
        });
      } else if (filterStatus === "untested") {
        filtered = filtered.filter((tc) => {
          const result = batchResults.find((r: any) => r.testCase?.id === tc.id);
          return !result;
        });
      }
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tc) =>
          tc.name.toLowerCase().includes(query) ||
          tc.input?.userMessage?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }

  function getUniqueTags(): string[] {
    const tags = new Set<string>();
    testCases.forEach((tc) => {
      tc.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  const filteredCases = getFilteredTestCases();
  const allTags = getUniqueTags();
  const passCount = batchResults.filter(
    (r) => r.validation?.overall?.passed === true
  ).length;
  const failCount = batchResults.filter(
    (r) => r.validation?.overall?.passed === false
  ).length;

  return (
    <div className="max-w-[1800px] mx-auto p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-xl font-semibold">AI Testing Interface</div>
        <div className="flex gap-2">
          {(["main", "eval-sets", "compare", "mutations", "cost", "human-review"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setSuiteToolTab(t);
                if (t === "eval-sets") loadEvalSets();
                if (t === "human-review") loadHumanReviews();
              }}
              className={`px-2 py-1 text-xs rounded ${suiteToolTab === t ? "bg-blue-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"}`}
            >
              {t === "main" ? "Main" : t === "eval-sets" ? "Eval Sets" : t === "compare" ? "Compare A/B" : t === "mutations" ? "Mutations" : t === "cost" ? "Cost" : "Human Review"}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            try {
              const r = await fetch("/api/admin/ai-training/export");
              if (!r.ok) {
                const j = await r.json();
                alert(`Export failed: ${j.error || "unknown error"}`);
                return;
              }
              const blob = await r.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `mtg-ai-training-${new Date().toISOString().slice(0, 10)}.jsonl`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            } catch (e) {
              console.error("Export failed:", e);
              alert("Failed to export training dataset");
            }
          }}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
        >
          Export Training Dataset (JSONL)
        </button>
      </div>

      {/* Suite Tools: Eval Sets, Compare, Mutations, Cost, Human Review */}
      {suiteToolTab !== "main" && (
        <section className="rounded border border-neutral-800 p-4 mb-4">
          {suiteToolTab === "eval-sets" && (
            <>
              <div className="mb-4">
                <ELI5
                  heading="What are Golden Eval Sets?"
                  items={[
                  "A Golden Set is a curated list of tests that must ALL pass before you deploy.",
                  "Think of it as a final exam: if any test fails, the whole set fails. No exceptions.",
                  "Use this when you want a strict gate — e.g. before releasing a prompt change.",
                  "Step 1: Create or pick a set. Step 2: Click Run Golden Set. Step 3: If it passes, you're good to go.",
                ]}
                />
              </div>
              <EvalSetsPanel
              evalSets={evalSets}
              expandedId={expandedEvalSetId}
              onExpand={setExpandedEvalSetId}
              onRefresh={loadEvalSets}
              adminFormatKey={adminFormatKey}
            />
            </>
          )}
          {suiteToolTab === "compare" && (
            <>
              <div className="mb-4">
                <ELI5
                  heading="What is Compare A/B?"
                  items={[
                  "Compare two versions of the AI side-by-side on the same questions.",
                  "Version A and Version B each answer the same test. A judge picks the better answer.",
                  "Use this when you have two prompts (or models) and want to see which one wins.",
                  "Step 1: Run Pairwise. Step 2: Check win rates. Step 3: Filter to disagreements to inspect.",
                ]}
                />
              </div>
              <PairwiseComparePanel
              filteredCases={filteredCases}
              pairwiseResult={pairwiseResult}
              pairwiseFilter={pairwiseFilter}
              onFilterChange={setPairwiseFilter}
              onRun={async () => {
                try {
                  const r = await fetch("/api/admin/ai-test/pairwise", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ test_case_ids: filteredCases.slice(0, 5).map((c) => c.id) }),
                  });
                  const j = await r.json();
                  if (j.ok) {
                    setPairwiseResult(j);
                  } else alert(j.error || "Failed");
                } catch (e: any) {
                  alert(e?.message || "Failed");
                }
              }}
            />
            </>
          )}
          {suiteToolTab === "mutations" && (
            <div className="space-y-4">
              <ELI5
                heading="What are Mutations?"
                items={[
                  "Mutations are twisted versions of existing tests — like 'what if the user forgot to say the format?'",
                  "They help catch edge cases: typos, missing info, messy decklists, etc.",
                  "Use this to grow your test suite with harder, weirder scenarios.",
                  "Step 1: Select one or more test cases. Step 2: Click Generate Mutations.",
                ]}
              />
              <div className="font-medium">Step 2: Generate Mutations</div>
              <p className="text-xs opacity-70">Step 1: Select test cases in the Main tab (or leave unselected to use first 3). Then click below.</p>
              <button
                onClick={async () => {
                  const ids = selectedCase ? [selectedCase.id] : filteredCases.slice(0, 3).map((c) => c.id);
                  if (ids.length === 0) {
                    alert("Select test cases first");
                    return;
                  }
                  try {
                    const r = await fetch("/api/admin/ai-test/generate-mutations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ base_test_case_ids: ids, count_per_case: 1 }),
                    });
                    const j = await r.json();
                    if (j.ok) {
                      alert(`Created ${j.created} mutations`);
                      loadTestCases();
                    } else alert(j.error || "Failed");
                  } catch (e: any) {
                    alert(e?.message || "Failed");
                  }
                }}
                className="px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500"
              >
                Generate Mutations
              </button>
            </div>
          )}
          {suiteToolTab === "cost" && (
            <div className="space-y-4">
              <ELI5
                heading="What is the Cost Report?"
                items={[
                  "See how much money (and time) each test run cost — tokens, API calls, judge calls.",
                  "Use this to track spend before/after prompt changes or to debug expensive runs.",
                  "Step 1: Get the eval run ID (see below). Step 2: Paste it here. Step 3: Click Load Report.",
                ]}
              />
              <div className="font-medium">Step 2: Enter eval run ID and load</div>
              <p className="text-xs opacity-70">
                Where to get the ID: Run a batch test (Main → Run All) or a Golden Set. The ID is in Eval Runs History (right column) or in the run result. Copy it here.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Eval run ID (e.g. 12345)"
                  id="cost-eval-run-id"
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm w-80"
                />
                <button
                  onClick={async () => {
                    const id = (document.getElementById("cost-eval-run-id") as HTMLInputElement)?.value?.trim();
                    if (!id) {
                      alert("Enter eval run ID");
                      return;
                    }
                    try {
                      const r = await fetch(`/api/admin/ai-test/cost-report?eval_run_id=${encodeURIComponent(id)}`);
                      const j = await r.json();
                      if (j.ok) setCostReport(j);
                      else alert(j.error || "Failed");
                    } catch (e: any) {
                      alert(e?.message || "Failed");
                    }
                  }}
                  className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500"
                >
                  Load Report
                </button>
              </div>
              {costReport && (
                <pre className="text-xs p-2 bg-neutral-900 rounded overflow-auto max-h-48">
                  {JSON.stringify(costReport, null, 2)}
                </pre>
              )}
            </div>
          )}
          {suiteToolTab === "human-review" && (
            <div className="space-y-4">
              <ELI5
                heading="What is Human Review?"
                items={[
                  "Sample real AI outputs from production and review them yourself.",
                  "Use this to calibrate the automated judges or spot issues the tests miss.",
                  "Step 1: Click Sample from Production. Step 2: Review the outputs. Step 3: Mark as reviewed.",
                ]}
              />
              <div className="font-medium">Human Review Queue</div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/admin/ai-test/sample-production", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ count: 10 }),
                      });
                      const j = await r.json();
                      if (j.ok) {
                        alert(`Sampled ${j.sampled}, created ${j.created} reviews`);
                        loadHumanReviews();
                      } else alert(j.error || "Failed");
                    } catch (e: any) {
                      alert(e?.message || "Failed");
                    }
                  }}
                  className="px-2 py-1 text-xs rounded bg-green-700 hover:bg-green-600"
                >
                  Sample from Production
                </button>
                <button onClick={loadHumanReviews} className="px-2 py-1 text-xs rounded bg-neutral-600">Refresh</button>
              </div>
              <div className="space-y-2 max-h-96 overflow-auto">
                {humanReviews.map((rev: any) => (
                  <div key={rev.id} className="p-2 bg-neutral-900 rounded border border-neutral-700">
                    <div className="text-xs font-mono truncate">{rev.route} • {rev.source}</div>
                    <div className="text-xs mt-1 line-clamp-2">{String(rev.output || "").slice(0, 200)}...</div>
                    <button
                      onClick={async () => {
                        try {
                          await fetch("/api/admin/ai-test/human-reviews", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: rev.id, labels: { overall: 4 }, status: "reviewed", reviewer: "admin" }),
                          });
                          loadHumanReviews();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="mt-1 px-2 py-0.5 text-xs rounded bg-blue-600"
                    >
                      Mark Reviewed
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3-Layer Prompt System */}
      <section className="rounded border border-neutral-800 p-3 mb-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="font-medium">3-Layer Prompt System (Base + Format + Modules)</div>
          <button
            onClick={() => {
              setShowLayerSection(!showLayerSection);
              if (!showLayerSection) {
                loadLayerKeys();
                loadLayer(layerTab === "base" ? "BASE_UNIVERSAL_ENFORCEMENT" : layerTab === "formats" ? `FORMAT_${adminFormatKey.toUpperCase()}` : "MODULE_CASCADE");
              }
            }}
            className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded"
          >
            {showLayerSection ? "Hide" : "Show"}
          </button>
        </div>
        {showLayerSection && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-xs opacity-70 mr-1">Format (for tests & preview)</label>
                <select
                  value={adminFormatKey}
                  onChange={(e) => setAdminFormatKey(e.target.value as typeof adminFormatKey)}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
                >
                  <option value="commander">Commander</option>
                  <option value="standard">Standard</option>
                  <option value="modern">Modern</option>
                  <option value="pioneer">Pioneer</option>
                  <option value="pauper">Pauper</option>
                </select>
              </div>
              <div className="flex gap-1">
                {(["base", "formats", "modules"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setLayerTab(t);
                      if (t === "base") loadLayer("BASE_UNIVERSAL_ENFORCEMENT");
                      else if (t === "formats") loadLayer(`FORMAT_${adminFormatKey.toUpperCase()}`);
                      else loadLayer("MODULE_CASCADE");
                    }}
                    className={`px-2 py-1 text-xs rounded ${layerTab === t ? "bg-blue-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"}`}
                  >
                    {t === "base" ? "Base" : t === "formats" ? "Formats" : "Modules"}
                  </button>
                ))}
              </div>
              <button onClick={loadComposedPreview} className="px-2 py-1 text-xs rounded bg-green-700 hover:bg-green-600">
                Preview composed prompt
              </button>
            </div>
            {layerTab === "base" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-70">Layer:</span>
                  <button onClick={() => loadLayer("BASE_UNIVERSAL_ENFORCEMENT")} className="text-xs px-2 py-0.5 rounded bg-neutral-700">BASE_UNIVERSAL_ENFORCEMENT</button>
                </div>
                <textarea value={layerBody} onChange={(e) => setLayerBody(e.target.value)} className="w-full h-48 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono" placeholder="Load layer to edit" />
                <div className="flex gap-2">
                  <button onClick={saveLayer} disabled={layerSaving} className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">{layerSaving ? "Saving..." : "Save"}</button>
                  <button onClick={() => loadLayerVersions(selectedLayerKey)} className="px-2 py-1 text-xs rounded bg-neutral-600 hover:bg-neutral-500">Version history</button>
                </div>
                {layerVersions.length > 0 && (
                  <div className="text-xs text-neutral-400 max-h-24 overflow-y-auto">
                    {layerVersions.map((v) => (
                      <div key={v.id}>{new Date(v.created_at).toLocaleString()}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {layerTab === "formats" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs opacity-70">Format layer:</span>
                  {["COMMANDER", "STANDARD", "MODERN", "PIONEER", "PAUPER"].map((f) => (
                    <button key={f} onClick={() => loadLayer(`FORMAT_${f}`)} className={`text-xs px-2 py-0.5 rounded ${selectedLayerKey === `FORMAT_${f}` ? "bg-blue-600" : "bg-neutral-700"}`}>FORMAT_{f}</button>
                  ))}
                </div>
                <textarea value={layerBody} onChange={(e) => setLayerBody(e.target.value)} className="w-full h-48 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono" placeholder="Load layer to edit" />
                <div className="flex gap-2">
                  <button onClick={saveLayer} disabled={layerSaving} className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">{layerSaving ? "Saving..." : "Save"}</button>
                  <button onClick={() => loadLayerVersions(selectedLayerKey)} className="px-2 py-1 text-xs rounded bg-neutral-600 hover:bg-neutral-500">Version history</button>
                </div>
                {layerVersions.length > 0 && (
                  <div className="text-xs text-neutral-400 max-h-24 overflow-y-auto">
                    {layerVersions.map((v) => (
                      <div key={v.id}>{new Date(v.created_at).toLocaleString()}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {layerTab === "modules" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs opacity-70">Module:</span>
                  {["MODULE_CASCADE", "MODULE_ARISTOCRATS", "MODULE_LANDFALL", "MODULE_SPELLSLINGER_STORM", "MODULE_GRAVEYARD_RECURSION"].map((m) => (
                    <button key={m} onClick={() => loadLayer(m)} className={`text-xs px-2 py-0.5 rounded ${selectedLayerKey === m ? "bg-blue-600" : "bg-neutral-700"}`}>{m}</button>
                  ))}
                </div>
                <textarea value={layerBody} onChange={(e) => setLayerBody(e.target.value)} className="w-full h-48 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono" placeholder="Load layer to edit" />
                <div className="flex gap-2">
                  <button onClick={saveLayer} disabled={layerSaving} className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">{layerSaving ? "Saving..." : "Save"}</button>
                  <button onClick={() => loadLayerVersions(selectedLayerKey)} className="px-2 py-1 text-xs rounded bg-neutral-600 hover:bg-neutral-500">Version history</button>
                </div>
                {layerVersions.length > 0 && (
                  <div className="text-xs text-neutral-400 max-h-24 overflow-y-auto">
                    {layerVersions.map((v) => (
                      <div key={v.id}>{new Date(v.created_at).toLocaleString()}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {composedPreview !== null && (
              <div className="rounded border border-neutral-700 p-2 space-y-1">
                <div className="text-xs font-medium">Composed prompt (format: {adminFormatKey})</div>
                {modulesAttachedPreview.length > 0 && <div className="text-xs text-green-400">Modules attached: {modulesAttachedPreview.join(", ")}</div>}
                <pre className="text-xs text-neutral-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{composedPreview.slice(0, 2000)}{composedPreview.length > 2000 ? "…" : ""}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-[1fr_500px] gap-4">
        {/* LEFT COLUMN: Tests */}
        <div className="space-y-4">
          <ELI5
        heading="What is this page?"
        items={[
          "This is where we test if the AI is giving good answers.",
          "Think of it like a spelling test, but for AI responses.",
          "We ask the AI questions and check if the answers are correct.",
          "Green checkmark = good answer. Red X = needs fixing.",
          "You can test one question at a time, or test everything at once.",
          "The results help us make the AI smarter over time.",
        ]}
      />

      <ELI5
        heading="Typical workflow (step by step)"
        items={[
          "Step 1: Use the filters below to find the tests you care about (or leave them as-is to see all).",
          "Step 2: Click Run All to run every test in the list. Wait for it to finish.",
          "Step 3: Check the results — green = passed, red = failed. Click a test to see details.",
          "Step 4: If you changed the prompt, run again to see if things improved.",
          "Step 5: Use the tabs above (Eval Sets, Compare, Cost, etc.) for advanced checks before deploy.",
        ]}
      />

      {/* Validation Options */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium flex items-center gap-2">
          How to Check Answers
          <HelpTip text="These are different ways to check if the AI's answer is good. Turn them on/off like light switches." />
        </div>
        <ELI5
          heading=""
          items={[
            "Keyword Checks: Looks for important words in the answer (like 'budget' or 'synergy').",
            "LLM Judge: Uses another AI to check if the answer makes sense (like a teacher grading homework).",
            "Reference Checks: Compares the answer to a known good answer.",
            "Semantic Similarity: Checks if the answer means the same thing, even if words are different.",
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={validationOptions.runKeywordChecks}
              onChange={(e) =>
                setValidationOptions({
                  ...validationOptions,
                  runKeywordChecks: e.target.checked,
                })
              }
            />
            Keyword Checks
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={validationOptions.runLLMFactCheck}
              onChange={(e) =>
                setValidationOptions({
                  ...validationOptions,
                  runLLMFactCheck: e.target.checked,
                })
              }
            />
            Run LLM Judge (default ON)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={validationOptions.runReferenceCompare}
              onChange={(e) =>
                setValidationOptions({
                  ...validationOptions,
                  runReferenceCompare: e.target.checked,
                })
              }
            />
            Run Reference Checks (default ON)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={validationOptions.runSemanticCheck}
              onChange={(e) =>
                setValidationOptions({
                  ...validationOptions,
                  runSemanticCheck: e.target.checked,
                })
              }
            />
            Semantic Similarity (requires expectedAnswer)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoMergeEnabled}
              onChange={(e) => setAutoMergeEnabled(e.target.checked)}
            />
            <span className="text-yellow-400">Auto-Merge Passing Patches</span>
          </label>
        </div>
      </section>

      {/* Filters and Search */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium flex items-center gap-2">
          Step 1: Find Tests
          <HelpTip text="Use these filters to find specific tests. Like searching for a book in a library." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="text-xs opacity-70">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search test cases..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs opacity-70">Filter by Type</label>
            <select
              value={filterType || ""}
              onChange={(e) => setFilterType(e.target.value || null)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
            >
              <option value="">All types</option>
              <option value="chat">Chat</option>
              <option value="deck_analysis">Deck Analysis</option>
            </select>
          </div>
          <div>
            <label className="text-xs opacity-70">Filter by Tag</label>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
            >
              <option value="">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs opacity-70">Filter by Status</label>
            <select
              value={filterStatus || ""}
              onChange={(e) => setFilterStatus(e.target.value || null)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
            >
              <option value="">All statuses</option>
              <option value="passed">✅ Passed</option>
              <option value="failed">❌ Failed</option>
              <option value="untested">⚪ Untested</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs opacity-70">
            Showing {filteredCases.length} of {testCases.length} test cases
          </div>
          {(filterType || filterTag || filterStatus || searchQuery) && (
            <button
              onClick={() => {
                setFilterType(null);
                setFilterTag("");
                setFilterStatus(null);
                setSearchQuery("");
              }}
              className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded"
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Test Case Generation */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Generate Test Cases (LLM)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <label className="text-xs opacity-70">Description</label>
            <input
              type="text"
              value={generateDescription}
              onChange={(e) => setGenerateDescription(e.target.value)}
              placeholder="e.g., 'test cases for ramp questions in Commander'"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs opacity-70">Count</label>
            <input
              type="number"
              value={generateCount}
              onChange={(e) => setGenerateCount(Math.max(1, parseInt(e.target.value) || 5))}
              min={1}
              max={20}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generateTestCases(false)}
            disabled={generating || !generateDescription.trim()}
            className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-sm"
          >
            {generating ? "Generating..." : "Generate Test Cases"}
          </button>
          <button
            onClick={() => generateTestCases(true)}
            disabled={generating}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm"
          >
            {generating ? "Generating..." : "🎲 Generate Random Tests (10-15)"}
          </button>
        </div>
      </section>

      {/* Batch Test Controls */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Batch Testing — Step 2: Run your tests</div>
          {batchResults.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-sm">
                Results:{" "}
                <span className="text-green-400">{passCount} passed</span> /{" "}
                <span className="text-red-400">{failCount} failed</span> /{" "}
                {batchResults.length - passCount - failCount} errors
              </div>
              <button
                onClick={() => {
                  if (confirm("Clear all test results? This will remove all batch test data from the current session.")) {
                    setBatchResults([]);
                    setExpandedResults(new Set());
                    setResultSuggestions(new Map());
                    setFilterStatus(null); // Reset status filter when clearing
                  }
                }}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                title="Clear all test results"
              >
                🗑️ Clear Results
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={runBatchTests}
            disabled={runningBatch || filteredCases.length === 0}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm"
          >
            {runningBatch ? "Running..." : `Run All (${filteredCases.length})`}
          </button>
          {batchResults.length > 0 && (
            <button
              onClick={() => {
                const dataStr = JSON.stringify(batchResults, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `test-results-${Date.now()}.json`;
                a.click();
              }}
              className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-800 text-sm"
            >
              Export Results
            </button>
          )}
        </div>
      </section>

      {/* Test Cases List */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Test Cases (click one to run it alone or see details)</div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredCases.length === 0 ? (
            <div className="text-sm opacity-70">No test cases found</div>
          ) : (
            filteredCases.map((testCase) => (
              <div
                key={testCase.id}
                className={`p-2 rounded border ${
                  selectedCase?.id === testCase.id
                    ? "border-blue-500 bg-blue-950/20"
                    : "border-neutral-700 bg-neutral-950/40"
                } cursor-pointer hover:bg-neutral-900/60`}
                onClick={() => setSelectedCase(testCase)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm">{testCase.name}</div>
                      {testCase.quality_score !== undefined && testCase.quality_score > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          testCase.quality_score >= 200 ? "bg-green-900/50 text-green-300" :
                          testCase.quality_score >= 100 ? "bg-yellow-900/50 text-yellow-300" :
                          "bg-gray-800 text-gray-400"
                        }`}>
                          Q:{Math.round(testCase.quality_score)}
                        </span>
                      )}
                      {(testCase.catch_count || 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">
                          🐛{testCase.catch_count}
                        </span>
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {testCase.type} • {testCase.source || "curated"}
                      {testCase.consistency_score !== undefined && testCase.consistency_score < 80 && (
                        <span className="ml-2 text-yellow-400">⚠️ Flaky</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {testCase.tags && testCase.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {testCase.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-full bg-neutral-800 text-[10px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Run consistency test for "${testCase.name}"? This will run the test 5 times.`)) return;
                          try {
                            const r = await fetch("/api/admin/ai-test/consistency", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ testCaseId: testCase.id, runs: 5 }),
                            });
                            const j = await r.json();
                            if (j.ok) {
                              alert(`Consistency Score: ${j.consistencyScore}%\nPass Rate: ${j.passRate}%\n${j.isFlaky ? "⚠️ This test is flaky!" : "✅ Test is consistent"}`);
                              loadTestCases(); // Reload to show updated consistency score
                            } else {
                              alert(`Failed: ${j.error}`);
                            }
                          } catch (e) {
                            alert("Failed to run consistency test");
                          }
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-800 hover:bg-blue-700 text-blue-200"
                        title="Test consistency (run 5 times)"
                      >
                        🔄 Consistency
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        runTest(testCase);
                      }}
                      disabled={loading}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-60"
                    >
                      Run
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Test Result Display */}
      {testResult && (
        <section className="rounded border border-neutral-800 p-3 space-y-3">
          <div className="font-medium">Test Result: {testResult.testCase.name}</div>

          {testResult.response.error && (
            <div className="p-2 rounded bg-red-950/40 border border-red-800 text-sm text-red-200">
              Error: {testResult.response.error}
            </div>
          )}

          {testResult.response.text && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm">Response</div>
                <button
                  onClick={() => setShowPromptInspector(!showPromptInspector)}
                  className="text-xs opacity-70 hover:opacity-100"
                >
                  {showPromptInspector ? "Hide" : "Show"} Prompt Inspector
                </button>
              </div>
              <div className="p-3 rounded bg-neutral-950 border border-neutral-700 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                {testResult.response.text}
              </div>
            </div>
          )}

          {showPromptInspector && testResult.response.promptUsed && (
            <div className="p-3 rounded bg-neutral-950 border border-neutral-700 text-xs">
              <div className="font-medium mb-2">Prompt Used:</div>
              <pre className="whitespace-pre-wrap text-[11px] opacity-80">
                {JSON.stringify(testResult.response.promptUsed, null, 2)}
              </pre>
            </div>
          )}

          {validationResult && (
            <div>
              <div className="font-medium text-sm mb-2">Validation Results</div>
              <div
                className={`p-3 rounded border ${
                  validationResult.overall?.passed
                    ? "bg-green-950/40 border-green-800"
                    : "bg-red-950/40 border-red-800"
                }`}
              >
                <div className="text-sm font-medium mb-2">
                  {validationResult.overall?.passed ? "✅ PASSED" : "❌ FAILED"} (
                  {validationResult.overall?.score}%)
                </div>
                <div className="text-xs opacity-80 mb-2">
                  {validationResult.overall?.summary}
                </div>

                {validationResult.keywordResults && (
                  <div className="mt-3">
                    <div className="text-xs font-medium mb-1">Keyword Checks:</div>
                    <div className="space-y-1">
                      {validationResult.keywordResults.checks.map(
                        (check: any, idx: number) => (
                          <div
                            key={idx}
                            className={`text-[11px] ${
                              check.passed ? "text-green-300" : "text-red-300"
                            }`}
                          >
                            {check.passed ? "✅" : "❌"} {check.message}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {validationResult.llmResults && (
                  <div className="mt-3">
                    <div className="text-xs font-medium mb-1">LLM Fact-Check:</div>
                    <div className="text-[11px]">
                      Score: {validationResult.llmResults.score}%
                      {validationResult.llmResults.warnings.length > 0 && (
                        <div className="mt-1 text-red-300">
                          Warnings: {validationResult.llmResults.warnings.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {validationResult.llmJudge && (
                  <div className="mt-3 p-2 bg-neutral-900/60 rounded border border-neutral-700">
                    <div className="text-xs font-medium mb-2">Structured Judge Scores:</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>Overall: <span className="font-semibold">{validationResult.llmJudge.overall_score}%</span></div>
                      <div>Factual: <span className="font-semibold">{validationResult.llmJudge.factual_score}%</span></div>
                      <div>Legality: <span className="font-semibold">{validationResult.llmJudge.legality_score}%</span></div>
                      <div>Synergy: <span className="font-semibold">{validationResult.llmJudge.synergy_score}%</span></div>
                      <div>Pedagogy: <span className="font-semibold">{validationResult.llmJudge.pedagogy_score}%</span></div>
                    </div>
                    {validationResult.llmJudge.issues.length > 0 && (
                      <div className="mt-2 text-[10px] text-red-300">
                        Issues: {validationResult.llmJudge.issues.join("; ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Batch Results Summary */}
      {batchResults.length > 0 && (
        <section className="rounded border border-neutral-800 p-3 space-y-2">
          <div className="font-medium">Batch Test Results</div>
          {lastEvalRunId != null && (
            <div className="text-xs opacity-80 mb-2">
              Eval run ID: <code className="bg-neutral-800 px-1 rounded">{lastEvalRunId}</code> — copy this for the Cost report (Cost tab).
            </div>
          )}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {batchResults.map((result, idx) => (
              <div
                key={idx}
                className={`p-2 rounded border cursor-pointer transition-colors ${
                  result.validation?.overall?.passed
                    ? "border-green-800 bg-green-950/20 hover:bg-green-950/30"
                    : result.validation?.overall?.passed === false
                    ? "border-red-800 bg-red-950/20 hover:bg-red-950/30"
                    : "border-neutral-700 bg-neutral-950/40 hover:bg-neutral-900/60"
                }`}
                onClick={() => toggleResultExpansion(idx, result)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{result.testCase.name}</div>
                    {result.validation?.overall && (
                      <div className="text-xs mt-1">
                        {result.validation.overall.passed ? "✅" : "❌"}{" "}
                        {result.validation.overall.score}% -{" "}
                        {result.validation.overall.summary}
                      </div>
                    )}
                    {result.validation?.llmJudge && (
                      <div className="text-[10px] mt-1 opacity-70">
                        Judge: {result.validation.llmJudge.overall_score}% (F:{result.validation.llmJudge.factual_score} L:{result.validation.llmJudge.legality_score} S:{result.validation.llmJudge.synergy_score} P:{result.validation.llmJudge.pedagogy_score})
                      </div>
                    )}
                    {result.error && (
                      <div className="text-xs text-red-400 mt-1">Error: {result.error}</div>
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="ml-2 flex items-center gap-1"
                  >
                    <span className="text-xs opacity-70">
                      {expandedResults.has(idx) ? "▼ Collapse" : "▶ Expand"}
                    </span>
                  </div>
                </div>
                
                {/* Expanded Content */}
                {expandedResults.has(idx) && (
                  <div className="mt-3 pt-3 border-t border-neutral-700 space-y-3">
                    {/* Test Input/Question */}
                    <div>
                      <div className="text-xs font-medium mb-1">Test Input:</div>
                      <div className="p-2 bg-neutral-950 rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {result.testCase?.input?.userMessage || 
                         result.testCase?.input?.text || 
                         (typeof result.testCase?.input === 'string' ? result.testCase.input : JSON.stringify(result.testCase?.input || {}, null, 2))}
                      </div>
                      {result.testCase?.input?.deckText && (
                        <div className="mt-2 p-2 bg-neutral-900 rounded text-[10px] font-mono max-h-24 overflow-y-auto opacity-80">
                          <div className="font-medium mb-1">Deck:</div>
                          {result.testCase.input.deckText.slice(0, 500)}
                          {result.testCase.input.deckText.length > 500 && '...'}
                        </div>
                      )}
                    </div>

                    {/* AI Response */}
                    <div>
                      <div className="text-xs font-medium mb-1">AI Response:</div>
                      <div className="p-2 bg-neutral-950 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {result.result?.response?.text || result.response?.text || "No response"}
                      </div>
                    </div>

                    {/* Validation Details */}
                    {result.validation && (
                      <div>
                        <div className="text-xs font-medium mb-1">Validation Details:</div>
                        <div className="p-2 bg-neutral-950 rounded text-xs space-y-2">
                          {result.validation.overall && (
                            <div>
                              <div className="font-medium">
                                Overall: {result.validation.overall.passed ? "✅ PASSED" : "❌ FAILED"} ({result.validation.overall.score}%)
                              </div>
                              <div className="text-[10px] opacity-70 mt-1">{result.validation.overall.summary}</div>
                            </div>
                          )}
                          
                          {/* Individual Judge Results */}
                          <div className="mt-2 space-y-1">
                            {result.validation.keywordResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Keywords:</span> {result.validation.keywordResults.passed ? "✅" : "❌"} {result.validation.keywordResults.message || ""}
                              </div>
                            )}
                            {result.validation.lengthResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Length:</span> {result.validation.lengthResults.passed ? "✅" : "❌"} {result.validation.lengthResults.message || ""}
                              </div>
                            )}
                            {result.validation.deckStyleResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Deck Style:</span> {result.validation.deckStyleResults.passed ? "✅" : "❌"} {result.validation.deckStyleResults.message || ""}
                              </div>
                            )}
                            {result.validation.problemsFirstResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Problems-First:</span> {result.validation.problemsFirstResults.passed ? "✅" : "❌"} {result.validation.problemsFirstResults.message || ""}
                              </div>
                            )}
                            {result.validation.synergyResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Synergy:</span> {result.validation.synergyResults.passed ? "✅" : "❌"} {result.validation.synergyResults.message || ""}
                              </div>
                            )}
                            {result.validation.consistencyResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Consistency:</span> {result.validation.consistencyResults.passed ? "✅" : "❌"} {result.validation.consistencyResults.message || ""}
                              </div>
                            )}
                            {result.validation.budgetResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Budget:</span> {result.validation.budgetResults.passed ? "✅" : "❌"} {result.validation.budgetResults.message || ""}
                              </div>
                            )}
                            {result.validation.toneResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Tone:</span> {result.validation.toneResults.passed ? "✅" : "❌"} {result.validation.toneResults.message || ""}
                              </div>
                            )}
                            {result.validation.specificityResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Specificity:</span> {result.validation.specificityResults.passed ? "✅" : "❌"} {result.validation.specificityResults.message || ""}
                              </div>
                            )}
                            {result.validation.colorIdentityResults && (
                              <div className="text-[10px]">
                                <span className="opacity-70">Color Identity & Legality:</span> {result.validation.colorIdentityResults.passed ? "✅" : "❌"} {result.validation.colorIdentityResults.message || ""}
                              </div>
                            )}
                          </div>

                          {/* LLM Judge Scores */}
                          {result.validation.llmJudge && (
                            <div className="mt-2 pt-2 border-t border-neutral-800">
                              <div className="text-[10px] font-medium mb-1">LLM Judge Scores:</div>
                              <div className="text-[10px] space-y-0.5">
                                <div>Overall: {result.validation.llmJudge.overall_score}%</div>
                                <div>Factual: {result.validation.llmJudge.factual_score}%</div>
                                <div>Legality: {result.validation.llmJudge.legality_score}%</div>
                                <div>Synergy: {result.validation.llmJudge.synergy_score}%</div>
                                <div>Pedagogy: {result.validation.llmJudge.pedagogy_score}%</div>
                                {result.validation.llmJudge.reasoning && (
                                  <div className="mt-1 pt-1 border-t border-neutral-800 opacity-70 italic">
                                    {result.validation.llmJudge.reasoning}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Suggestions for this result */}
                    {result.validation?.overall?.passed === false && resultSuggestions.has(idx) && (
                      <div>
                        <div className="text-xs font-medium mb-1">Improvement Suggestions:</div>
                        <div className="space-y-2">
                          {resultSuggestions.get(idx)?.map((suggestion: any, sIdx: number) => (
                            <div key={sIdx} className="p-2 bg-neutral-900 rounded border border-neutral-700">
                              <div className="text-[10px] font-medium mb-1">
                                {suggestion.priority === "high" ? "🔴" : suggestion.priority === "medium" ? "🟡" : "🔵"} {suggestion.category || "General"}
                              </div>
                              <div className="text-[10px] opacity-80 mb-1">{suggestion.issue}</div>
                              <div className="text-[10px] opacity-70">{suggestion.suggestedPromptAddition}</div>
                              <div className="text-[9px] opacity-60 mt-1 italic">{suggestion.rationale}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Prompt Impact Preview */}
                    {result.validation?.overall?.passed === false && resultSuggestions.has(idx) && (
                      <div>
                        <div className="text-xs font-medium mb-1">How This Would Affect Prompt:</div>
                        <div className="p-2 bg-neutral-900 rounded border border-neutral-700 text-[10px] font-mono max-h-32 overflow-y-auto">
                          {currentPromptText && (
                            <>
                              <div className="opacity-60 mb-1">Current prompt + suggested additions:</div>
                              <div className="whitespace-pre-wrap">
                                {currentPromptText}
                                {"\n\n=== AI TEST IMPROVEMENTS ===\n"}
                                {resultSuggestions.get(idx)?.map((s: any) => s.suggestedPromptAddition).join("\n\n")}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {batchResults.length > 0 && (
            <div className="mt-3">
              <button
                onClick={async () => {
                  setAnalyzing(true);
                  try {
                    const r = await fetch("/api/admin/ai-test/analyze-failures", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ batchResults }),
                    });
                    const j = await r.json();
                    if (j.ok) {
                      setImprovementSuggestions(j);
                      loadPendingPatches(); // Refresh patches
                      if (j.warning) {
                        alert(`${j.warning}\n\n${j.message || `Created ${j.patches?.length || 0} prompt patches`}\n\nTo enable patch saving, run the SQL migration to create the prompt_patches table.`);
                      } else {
                        alert(j.message || `Created ${j.patches?.length || 0} prompt patches`);
                      }
                    } else {
                      alert(`Analysis failed: ${j.error}`);
                    }
                  } catch (e) {
                    console.error("Failed to analyze:", e);
                    alert("Failed to analyze failures");
                  } finally {
                    setAnalyzing(false);
                  }
                }}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
                disabled={analyzing}
              >
                {analyzing ? "Analyzing..." : "Auto-Improve"}
              </button>
            </div>
          )}
        </section>
      )}
        </div>

        {/* RIGHT COLUMN: Prompt & Versions */}
        <div className="space-y-4">
          {/* Current Active Prompt */}
          <section className="rounded border border-neutral-800 p-3 space-y-2" data-prompt-section>
            <div className="flex items-center justify-between">
              <div className="font-medium">Current Active Prompt (Chat)</div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!confirm("Refactor prompt to deduplicate rules and consolidate improvements?")) return;
                    try {
                      const r = await fetch("/api/admin/ai-test/refactor-prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ kind: "chat", setActive: true }),
                      });
                      const j = await r.json();
                      if (j.ok) {
                        loadPromptVersions();
                        alert(`✅ Prompt refactored! New version: ${j.newVersion}\n\nStats:\n- Length: ${j.stats.originalLength} → ${j.stats.refactoredLength} chars\n- Rules: ${j.stats.rulesBefore} → ${j.stats.rulesAfter}\n- Improvements: ${j.stats.improvementsCount}`);
                      } else {
                        alert(`Failed: ${j.error}`);
                      }
                    } catch (e) {
                      alert("Failed to refactor prompt");
                    }
                  }}
                  className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
                >
                  Refactor
                </button>
                <button
                  onClick={loadPromptVersions}
                  className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs"
                >
                  Refresh
                </button>
              </div>
            </div>
            {currentPromptText ? (
              <div className="relative">
                <div className="w-full h-48 p-2 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono overflow-y-auto whitespace-pre-wrap">
                  {recentAdditions && recentAdditions.length > 0 ? (
                    <>
                      {currentPromptText.split(/(=== AI TEST IMPROVEMENTS \(Auto-Applied\) ===[\s\S]*?)(?=(?:===|$))/).map((part, idx) => {
                        if (part.includes("=== AI TEST IMPROVEMENTS")) {
                          // Split improvements section and highlight recent additions
                          const improvementsHeader = "=== AI TEST IMPROVEMENTS (Auto-Applied) ===";
                          const improvementsContent = part.replace(improvementsHeader, "").trim();
                          
                          return (
                            <span key={idx} className="bg-green-900/40 border-l-2 border-green-500 pl-2 block">
                              {improvementsHeader}
                              {improvementsContent.split(/\n\n+/).map((block: string, blockIdx: number) => {
                                const isRecent = recentAdditions.some((addition: string) => 
                                  block.includes(addition.trim().slice(0, 50)) // Match first 50 chars
                                );
                                return (
                                  <span key={blockIdx} className={isRecent ? "bg-yellow-500/40 text-yellow-200 block my-1 px-1 rounded" : ""}>
                                    {block}
                                    {blockIdx < improvementsContent.split(/\n\n+/).length - 1 && "\n\n"}
                                  </span>
                                );
                              })}
                            </span>
                          );
                        }
                        return <span key={idx}>{part}</span>;
                      })}
                    </>
                  ) : (
                    currentPromptText
                  )}
                </div>
                {recentAdditions && recentAdditions.length > 0 && (
                  <div className="absolute top-2 right-2 text-[10px] bg-green-600/20 border border-green-500/50 rounded px-2 py-1 z-10">
                    {recentAdditions.length} recent addition{recentAdditions.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs opacity-70">Loading...</div>
            )}
            {recentAdditions && recentAdditions.length > 0 && (
              <div className="mt-2 p-2 bg-green-950/20 border border-green-800/50 rounded">
                <div className="text-xs font-medium mb-1 text-green-400">Recent Additions (highlighted):</div>
                <div className="text-[10px] font-mono space-y-1">
                  {recentAdditions.map((addition: string, idx: number) => (
                    <div key={idx} className="p-1 bg-green-900/30 rounded">
                      {addition}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Pending Patches */}
      {pendingPatches.length > 0 && (
        <section className="rounded border border-neutral-800 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">Pending Prompt Patches</div>
            <button
              onClick={() => {
                if (selectedPatches.size === pendingPatches.length) {
                  setSelectedPatches(new Set());
                } else {
                  setSelectedPatches(new Set(pendingPatches.map((p: any) => p.id)));
                }
              }}
              className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs"
            >
              {selectedPatches.size === pendingPatches.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="space-y-2 max-h-[1728px] overflow-y-auto">
            {pendingPatches.map((patch: any) => (
              <div key={patch.id} className="p-3 rounded border border-neutral-700 bg-neutral-950/40">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedPatches.has(patch.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedPatches);
                      if (e.target.checked) {
                        newSet.add(patch.id);
                      } else {
                        newSet.delete(patch.id);
                      }
                      setSelectedPatches(newSet);
                    }}
                    className="mt-1.5"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-medium">
                        {patch.priority === "high" ? "🔴" : patch.priority === "medium" ? "🟡" : "🔵"} {patch.category || "General"}
                      </div>
                      {patch.affected_tests && patch.affected_tests.length > 0 && (
                        <div className="text-[10px] opacity-60">
                          ({patch.affected_tests.length} test{patch.affected_tests.length !== 1 ? 's' : ''})
                        </div>
                      )}
                    </div>
                    {patch.rationale && (
                      <div className="text-[11px] opacity-80 leading-relaxed">{patch.rationale}</div>
                    )}
                    <div className="p-3 bg-cyan-950/40 border-2 border-cyan-700/60 rounded text-[12px] font-mono whitespace-pre-wrap leading-relaxed">
                      <div className="text-[10px] font-semibold text-cyan-300 mb-1.5 uppercase tracking-wide">Suggested Fix:</div>
                      {patch.suggested_text}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {selectedPatches.size > 0 && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <select
                  value={applyAction}
                  onChange={(e) => {
                    setApplyAction(e.target.value as any);
                    const selected = pendingPatches.filter((p: any) => selectedPatches.has(p.id));
                    previewPromptWithPatches(selected, e.target.value as any);
                  }}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
                >
                  <option value="append">Append</option>
                  <option value="prepend">Prepend</option>
                  <option value="replace">Replace</option>
                </select>
                <button
                  onClick={() => {
                    const selected = pendingPatches.filter((p: any) => selectedPatches.has(p.id));
                    previewPromptWithPatches(selected, applyAction);
                  }}
                  className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs"
                >
                  Preview
                </button>
                <button
                onClick={async () => {
                  setApplying(true);
                  try {
                    const r = await fetch("/api/admin/ai-test/apply-improvements", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        patchIds: Array.from(selectedPatches),
                        kind: "chat",
                        action: applyAction,
                      }),
                    });
                    const j = await r.json();
                    if (j.ok) {
                      const appliedCount = selectedPatches.size;
                      const appliedPatchTexts = pendingPatches
                        .filter((p: any) => selectedPatches.has(p.id))
                        .map((p: any) => p.suggested_text);
                      setSelectedPatches(new Set());
                      loadPendingPatches();
                      // Store applied patch texts for highlighting
                      if (appliedPatchTexts.length > 0) {
                        setRecentAdditions(appliedPatchTexts);
                      }
                      // Refresh prompt versions to show new active version with highlights
                      // Force reload by clearing cache and reloading
                      setTimeout(async () => {
                        // Clear any cached prompt data
                        setCurrentPromptText("");
                        setLastPromptVersion("");
                        // Reload with no-cache to ensure we get the latest
                        await loadPromptVersions();
                        // Also force a page refresh of the prompt section to ensure UI updates
                        window.location.hash = 'prompt-updated';
                        // Scroll to prompt section to show the update
                        const promptSection = document.querySelector('[data-prompt-section]');
                        if (promptSection) {
                          promptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 500); // Small delay to ensure DB is updated
                      alert(`Applied ${appliedCount} patches. New version: ${j.newVersion}\n\n✅ The new prompt version has been set as ACTIVE and will be used for all future tests.`);
                    } else {
                      alert(`Failed to apply patches: ${j.error}`);
                    }
                  } catch (e) {
                    console.error("Failed to apply patches:", e);
                  } finally {
                    setApplying(false);
                  }
                }}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                disabled={applying}
              >
                {applying ? "Applying..." : `Apply Selected (${selectedPatches.size})`}
              </button>
              </div>
              {previewPrompt && (
                <div className="mt-2 p-2 bg-neutral-900 rounded border border-neutral-700">
                  <div className="text-xs font-medium mb-1">Preview:</div>
                  <textarea
                    readOnly
                    value={previewPrompt}
                    className="w-full h-32 p-2 bg-neutral-950 border border-neutral-700 rounded text-[10px] font-mono"
                  />
                  <button
                    onClick={() => setPreviewPrompt(null)}
                    className="mt-1 text-[10px] px-2 py-0.5 bg-neutral-700 hover:bg-neutral-600 rounded"
                  >
                    Close Preview
                  </button>
                </div>
              )}
            </div>
          )}
          </section>
          )}

          {/* Test Coverage Dashboard */}
          {coverageData && (
            <section className="rounded border border-neutral-800 p-3 space-y-2">
              <div className="font-medium">Test Coverage Dashboard</div>
              <div className="space-y-3">
                {/* Overall Stats */}
                <div className="p-2 bg-neutral-900 rounded border border-neutral-700">
                  <div className="text-xs font-medium mb-2">Overall Coverage</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="opacity-70">Total Tests</div>
                      <div className="font-semibold">{coverageData.overall.total}</div>
                    </div>
                    <div>
                      <div className="opacity-70">Pass Rate</div>
                      <div className={`font-semibold ${coverageData.overall.passRate >= 80 ? "text-green-400" : coverageData.overall.passRate >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                        {coverageData.overall.passRate}%
                      </div>
                    </div>
                    <div>
                      <div className="opacity-70">✅ Passed</div>
                      <div className="font-semibold text-green-400">{coverageData.overall.passed}</div>
                    </div>
                    <div>
                      <div className="opacity-70">❌ Failed</div>
                      <div className="font-semibold text-red-400">{coverageData.overall.failed}</div>
                    </div>
                    <div>
                      <div className="opacity-70">⚪ Untested</div>
                      <div className="font-semibold text-gray-400">{coverageData.overall.untested}</div>
                    </div>
                    <div>
                      <div className="opacity-70">Tested</div>
                      <div className="font-semibold">{coverageData.overall.tested}</div>
                    </div>
                  </div>
                </div>

                {/* Coverage by Type */}
                {coverageData.byType && Object.keys(coverageData.byType).length > 0 && (
                  <div className="p-2 bg-neutral-900 rounded border border-neutral-700">
                    <div className="text-xs font-medium mb-2">By Type</div>
                    <div className="space-y-1">
                      {Object.entries(coverageData.byType).map(([type, stats]: [string, any]) => {
                        const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
                        return (
                          <div key={type} className="text-[10px] flex justify-between items-center">
                            <span className="capitalize">{type}</span>
                            <div className="flex gap-2">
                              <span className="text-green-400">{stats.passed}</span>
                              <span className="text-red-400">{stats.failed}</span>
                              <span className="text-gray-400">{stats.untested}</span>
                              <span className={`font-semibold ${passRate >= 80 ? "text-green-400" : passRate >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                                {passRate}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coverage by Tag */}
                {coverageData.byTag && Object.keys(coverageData.byTag).length > 0 && (
                  <div className="p-2 bg-neutral-900 rounded border border-neutral-700 max-h-48 overflow-y-auto">
                    <div className="text-xs font-medium mb-2">By Category</div>
                    <div className="space-y-1">
                      {Object.entries(coverageData.byTag)
                        .sort(([, a]: [string, any], [, b]: [string, any]) => b.total - a.total)
                        .slice(0, 10)
                        .map(([tag, stats]: [string, any]) => {
                          const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
                          return (
                            <div key={tag} className="text-[10px] flex justify-between items-center">
                              <span className="capitalize">{tag}</span>
                              <div className="flex gap-2">
                                <span className="text-green-400">{stats.passed}</span>
                                <span className="text-red-400">{stats.failed}</span>
                                <span className={`font-semibold ${passRate >= 80 ? "text-green-400" : passRate >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                                  {passRate}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Test History */}
          {testHistory.length > 0 && (
            <section className="rounded border border-neutral-800 p-3 space-y-2">
              <div className="font-medium">Test History</div>
              <div className="space-y-1 max-h-64 overflow-y-auto text-xs">
                {testHistory.slice(0, 10).map((entry: any) => (
                  <div key={entry.id} className="p-2 rounded border border-neutral-700 bg-neutral-950/40">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{entry.suite}</div>
                        <div className="text-[10px] opacity-70">
                          {new Date(entry.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold ${entry.passRate >= 80 ? "text-green-400" : entry.passRate >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                        {entry.passRate}%
                      </div>
                    </div>
                    <div className="text-[10px] opacity-70 mt-1">
                      {entry.passCount || 0}/{entry.testCount || 0} passed | Prompt: {entry.promptVersion || "unknown"}
                    </div>
                    {entry.failCount !== undefined && (
                      <div className="text-[10px] opacity-60 mt-0.5">
                        ❌ {entry.failCount} failed
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Eval Runs History */}
          {evalRuns.length > 0 && (
        <section className="rounded border border-neutral-800 p-3 space-y-2">
          <div className="font-medium">Eval Runs History</div>
          <div className="space-y-2">
            <div className="text-xs opacity-70 mb-2">Select two runs to compare. ID = use in Cost tab for cost report.</div>
            <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
              {evalRuns.map((run: any) => (
                <div key={run.id} className="p-2 rounded border border-neutral-700 bg-neutral-950/40">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="runA"
                          checked={selectedRunA === run.id}
                          onChange={() => setSelectedRunA(run.id)}
                          className="w-3 h-3"
                        />
                        <span className="text-[10px]">A</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="runB"
                          checked={selectedRunB === run.id}
                          onChange={() => setSelectedRunB(run.id)}
                          className="w-3 h-3"
                        />
                        <span className="text-[10px]">B</span>
                      </label>
                    </div>
                    <div className="flex-1 flex justify-between items-center">
                      <div>
                        <div className="font-medium">{run.suite}</div>
                        <div className="text-[10px] opacity-70">
                          ID: <code className="bg-neutral-800 px-0.5 rounded">{run.id}</code> · {run.status} · {new Date(run.created_at).toLocaleString()}
                        </div>
                      </div>
                      {run.meta?.pass_rate !== undefined && (
                        <div className={`text-sm font-semibold ${run.meta.pass_rate >= 80 ? "text-green-400" : "text-red-400"}`}>
                          {run.meta.pass_rate}%
                        </div>
                      )}
                    </div>
                  </div>
                  {run.meta && (
                    <div className="text-[10px] opacity-70 mt-1 ml-12">
                      {run.meta.pass_count || 0}/{run.meta.test_count || 0} passed
                      {run.meta.fail_count !== undefined && ` | ❌ ${run.meta.fail_count} failed`}
                      {run.meta.prompt_version && ` | Prompt: ${run.meta.prompt_version}`}
                      {!run.meta.prompt_version && " | Prompt: unknown"}
                    </div>
                  )}
                  {!run.meta && (
                    <div className="text-[10px] opacity-70 mt-1 ml-12">
                      No test data available
                    </div>
                  )}
                </div>
              ))}
            </div>
            {selectedRunA && selectedRunB && (
              <button
                onClick={async () => {
                  setLoadingComparison(true);
                  try {
                    const r = await fetch("/api/admin/ai-test/compare-runs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ runAId: selectedRunA, runBId: selectedRunB }),
                    });
                    const j = await r.json();
                    if (j.ok) {
                      setComparisonData(j);
                    } else {
                      alert(`Comparison failed: ${j.error}`);
                    }
                  } catch (e) {
                    console.error("Failed to compare:", e);
                    alert("Failed to compare runs");
                  } finally {
                    setLoadingComparison(false);
                  }
                }}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                disabled={loadingComparison}
              >
                {loadingComparison ? "Comparing..." : "Compare Runs"}
              </button>
            )}
            {comparisonData && (
              <div className="mt-3 p-3 rounded border border-neutral-700 bg-neutral-950/60">
                <div className="text-sm font-medium mb-2">Comparison Results</div>
                <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
                  <div>
                    <div className="opacity-70">Run A:</div>
                    <div className="font-medium">{comparisonData.runA.suite}</div>
                    <div className="opacity-70">Pass Rate: {comparisonData.comparison.passRateA}%</div>
                  </div>
                  <div>
                    <div className="opacity-70">Run B:</div>
                    <div className="font-medium">{comparisonData.runB.suite}</div>
                    <div className="opacity-70">Pass Rate: {comparisonData.comparison.passRateB}%</div>
                  </div>
                </div>
                <div className={`text-sm font-semibold mb-3 ${comparisonData.comparison.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                  Change: {comparisonData.comparison.change >= 0 ? "+" : ""}{comparisonData.comparison.change}%
                </div>
                <div className="space-y-2 text-xs">
                  {comparisonData.comparison.categorized.regression.length > 0 && (
                    <div>
                      <div className="font-medium text-red-400 mb-1">
                        Regressions ({comparisonData.comparison.categorized.regression.length})
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {comparisonData.comparison.categorized.regression.map((item: any, idx: number) => (
                          <div key={idx} className="p-1 rounded border border-red-800 bg-red-950/20">
                            <div className="font-medium">{item.testCase.name}</div>
                            <div className="opacity-70 text-[10px]">Type: {item.testCase.type}</div>
                            {item.resultA?.judge && item.resultB?.judge && (
                              <div className="text-[10px] mt-1">
                                A: {item.resultA.judge.overall_score}% → B: {item.resultB.judge.overall_score}%
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {comparisonData.comparison.categorized.improved.length > 0 && (
                    <div>
                      <div className="font-medium text-green-400 mb-1">
                        Improved ({comparisonData.comparison.categorized.improved.length})
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {comparisonData.comparison.categorized.improved.map((item: any, idx: number) => (
                          <div key={idx} className="p-1 rounded border border-green-800 bg-green-950/20">
                            <div className="font-medium">{item.testCase.name}</div>
                            <div className="opacity-70 text-[10px]">Type: {item.testCase.type}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {comparisonData.comparison.categorized.unchangedFailed.length > 0 && (
                    <div>
                      <div className="font-medium text-yellow-400 mb-1">
                        Unchanged Failed ({comparisonData.comparison.categorized.unchangedFailed.length})
                      </div>
                    </div>
                  )}
                  {comparisonData.comparison.categorized.unchangedPassed.length > 0 && (
                    <div>
                      <div className="font-medium text-green-400 mb-1">
                        Unchanged Passed ({comparisonData.comparison.categorized.unchangedPassed.length})
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </section>
          )}

          {/* Manual Prompt Replacement */}
          <section className="rounded border border-neutral-800 p-3 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-medium">Manual Prompt Replacement</div>
              <button
                onClick={async () => {
                  setShowManualPromptReplacement(!showManualPromptReplacement);
                  if (!showManualPromptReplacement) {
                    // Load current prompt text when opening
                    await loadCurrentPromptText();
                  }
                }}
                className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded"
              >
                {showManualPromptReplacement ? "Hide" : "Show"}
              </button>
            </div>
            {showManualPromptReplacement && (
              <div className="space-y-3">
                <div className="text-xs text-neutral-400">
                  Paste a refactored prompt from your LLM to create a new version and set it as active.
                </div>
                <div>
                  <label className="text-xs opacity-70 mb-1 block">Prompt Type</label>
                  <select
                    value={manualPromptKind}
                    onChange={async (e) => {
                      setManualPromptKind(e.target.value as "chat" | "deck_analysis");
                      // Reload prompt text when switching kind
                      const newKind = e.target.value as "chat" | "deck_analysis";
                      try {
                        const r = await fetch(`/api/admin/prompt-versions?kind=${newKind}`, { cache: "no-store" });
                        const j = await r.json();
                        if (j?.ok && j.activePromptText) {
                          setManualPromptText(j.activePromptText);
                        }
                      } catch (err) {
                        console.error("Failed to load prompt:", err);
                      }
                    }}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
                  >
                    <option value="chat">Chat</option>
                    <option value="deck_analysis">Deck Analysis</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs opacity-70 mb-1 block">Description (optional)</label>
                  <input
                    type="text"
                    value={manualPromptDescription}
                    onChange={(e) => setManualPromptDescription(e.target.value)}
                    placeholder="e.g., 'Refactored by LLM for better structure'"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs opacity-70 mb-1 block">Paste Prompt Text</label>
                  <textarea
                    value={manualPromptText}
                    onChange={(e) => setManualPromptText(e.target.value)}
                    placeholder="Paste your refactored prompt here..."
                    className="w-full h-64 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm font-mono"
                    style={{ fontFamily: "monospace", fontSize: "11px", lineHeight: "1.4" }}
                  />
                  <div className="text-xs text-neutral-500 mt-1">
                    {manualPromptText.length} characters
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!manualPromptText.trim()) {
                      alert("Please paste a prompt");
                      return;
                    }
                    if (!confirm(`Create new ${manualPromptKind} prompt version and set as active?`)) {
                      return;
                    }
                    setCreatingPrompt(true);
                    try {
                      const r = await fetch("/api/admin/prompt-versions/create", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          promptText: manualPromptText,
                          kind: manualPromptKind,
                          description: manualPromptDescription || "Manually pasted prompt replacement",
                        }),
                      });
                      const j = await r.json();
                      if (j.ok) {
                        alert(`✅ Created ${j.newVersion} and set as active!\nPrevious: ${j.previousVersion}\nLength: ${j.promptLength} chars`);
                        setManualPromptText("");
                        setManualPromptDescription("");
                        loadPromptVersions();
                      } else {
                        alert(`Failed: ${j.error}`);
                      }
                    } catch (e: any) {
                      alert(`Error: ${e.message}`);
                    } finally {
                      setCreatingPrompt(false);
                    }
                  }}
                  disabled={creatingPrompt || !manualPromptText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:opacity-50 rounded text-sm font-medium"
                >
                  {creatingPrompt ? "Creating..." : "Create New Version & Set Active"}
                </button>
              </div>
            )}
          </section>

          {/* Prompt Versions */}
          <section className="rounded border border-neutral-800 p-3 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-medium">Prompt Versions</div>
              <button
            onClick={() => {
              setShowPromptVersions(!showPromptVersions);
              if (!showPromptVersions) {
                loadPromptVersions();
              }
            }}
            className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded"
          >
            {showPromptVersions ? "Hide" : "Show"}
          </button>
        </div>
        {showPromptVersions && (
          <div className="space-y-4">
            {(["chat", "deck_analysis"] as const).map((kind) => (
              <div key={kind}>
                <div className="text-sm font-medium mb-2 capitalize">
                  {kind === "deck_analysis" ? "Deck Analysis" : "Chat"} Prompts
                  {activePromptVersions[kind] && (
                    <span className="ml-2 text-xs text-green-400">
                      (Active: {promptVersions[kind].find((v: any) => v.id === activePromptVersions[kind])?.version || "unknown"})
                    </span>
                  )}
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {promptVersions[kind].length === 0 ? (
                    <div className="p-2 text-xs text-neutral-400 italic">
                      No {kind === "deck_analysis" ? "deck analysis" : "chat"} prompt versions found. Run the SQL migration to create them.
                    </div>
                  ) : (
                    promptVersions[kind].map((version: any) => (
                    <div
                      key={version.id}
                      className={`p-2 rounded border ${
                        activePromptVersions[kind] === version.id
                          ? "border-green-500 bg-green-950/20"
                          : "border-neutral-700 bg-neutral-950/40"
                      } cursor-pointer hover:bg-neutral-900/60`}
                      onClick={() => setSelectedPromptVersion({ kind, version })}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{version.version}</span>
                          {activePromptVersions[kind] === version.id && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-600 rounded">Active</span>
                          )}
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Set ${version.version} as active for ${kind}?`)) {
                              const r = await fetch("/api/admin/prompt-versions", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ versionId: version.id, kind }),
                              });
                              const j = await r.json();
                              if (j.ok) {
                                loadPromptVersions();
                                alert(`Set ${version.version} as active`);
                              } else {
                                alert(`Failed: ${j.error}`);
                              }
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-700 rounded"
                          disabled={activePromptVersions[kind] === version.id}
                        >
                          Set as active
                        </button>
                      </div>
                      <div className="text-[10px] opacity-70 mt-1">
                        {new Date(version.created_at).toLocaleString()}
                      </div>
                      {version.meta && (
                        <div className="text-[10px] opacity-60 mt-1">
                          Meta: {JSON.stringify(version.meta).slice(0, 50)}...
                        </div>
                      )}
                    </div>
                    ))
                  )}
                </div>
              </div>
            ))}
            {selectedPromptVersion && (
              <div className="mt-4 p-3 rounded border border-neutral-700 bg-neutral-950/60">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium text-sm">
                    {selectedPromptVersion.version.version} ({selectedPromptVersion.kind})
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const r = await fetch(`/api/admin/ai-test/prompt-impact?promptVersionId=${selectedPromptVersion.version.id}`);
                          const j = await r.json();
                          if (j.ok) {
                            alert(`Prompt Impact Analysis:\n\n✅ Improved: ${j.impact.improved} tests\n❌ Regressed: ${j.impact.regressed} tests\n➖ Unchanged: ${j.impact.unchanged} tests\n📈 Pass Rate Change: ${j.impact.passRateChange >= 0 ? "+" : ""}${j.impact.passRateChange.toFixed(1)}%\n\nBefore: ${j.impact.beforePassRate}% → After: ${j.impact.afterPassRate}%`);
                          } else {
                            alert(`Failed: ${j.error}`);
                          }
                        } catch (e) {
                          alert("Failed to load impact analysis");
                        }
                      }}
                      className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded"
                      title="Show impact of this prompt version"
                    >
                      📊 Impact
                    </button>
                    <button
                      onClick={() => setSelectedPromptVersion(null)}
                      className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs font-medium mb-1">System Prompt:</div>
                    <textarea
                      readOnly
                      value={selectedPromptVersion.version.system_prompt}
                      className="w-full h-64 p-2 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono"
                    />
                  </div>
                  {selectedPromptVersion.version.meta && (
                    <div>
                      <div className="text-xs font-medium mb-1">Meta:</div>
                      <pre className="text-xs p-2 bg-neutral-900 border border-neutral-700 rounded overflow-auto max-h-32">
                        {JSON.stringify(selectedPromptVersion.version.meta, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
          </section>
        </div>
      </div>
    </div>
  );
}

