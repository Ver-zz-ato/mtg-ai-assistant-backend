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

export default function AiTestPage() {
  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [selectedCase, setSelectedCase] = React.useState<TestCase | null>(null);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);
  const [validationResult, setValidationResult] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [runningBatch, setRunningBatch] = React.useState(false);
  const [batchResults, setBatchResults] = React.useState<any[]>([]);
  const [filterTag, setFilterTag] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showPromptInspector, setShowPromptInspector] = React.useState(false);
  const [validationOptions, setValidationOptions] = React.useState({
    runKeywordChecks: true,
    runLLMFactCheck: false,
    runReferenceCompare: false,
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

  // Load test cases
  React.useEffect(() => {
    loadTestCases();
  }, []);

  async function loadTestCases() {
    try {
      const r = await fetch("/api/admin/ai-test/cases", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setTestCases(j.testCases || []);
      } else {
        console.error("Failed to load test cases:", j?.error);
        alert(`Failed to load test cases: ${j?.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to load test cases:", e);
      alert(`Failed to load test cases: ${e instanceof Error ? e.message : "Unknown error"}`);
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
        body: JSON.stringify({ testCase }),
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

  async function analyzeFailures() {
    if (batchResults.length === 0) {
      alert("Run tests first to analyze failures");
      return;
    }

    setAnalyzing(true);
    setImprovementSuggestions(null);
    setSelectedSuggestions(new Set());
    try {
      const res = await fetch("/api/admin/ai-test/analyze-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchResults }),
      });
      const data = await res.json();
      if (data.ok) {
        setImprovementSuggestions(data);
        // Auto-select all high priority suggestions
        const highPriorityIndices = new Set<number>();
        data.analysis?.suggestions?.forEach((s: any, idx: number) => {
          if (s.priority === "high") {
            highPriorityIndices.add(idx);
          }
        });
        setSelectedSuggestions(highPriorityIndices);
      } else {
        throw new Error(data.error || "Analysis failed");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to analyze failures");
    } finally {
      setAnalyzing(false);
    }
  }

  async function applyImprovements() {
    if (!improvementSuggestions?.analysis?.suggestions) {
      alert("No suggestions to apply");
      return;
    }

    const suggestionsToApply = improvementSuggestions.analysis.suggestions.filter(
      (_: any, idx: number) => selectedSuggestions.has(idx)
    );

    if (suggestionsToApply.length === 0) {
      alert("Select at least one suggestion to apply");
      return;
    }

    if (!confirm(`Apply ${suggestionsToApply.length} improvement(s) to system prompt?`)) {
      return;
    }

    setApplying(true);
    try {
      const res = await fetch("/api/admin/ai-test/apply-improvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestions: suggestionsToApply,
          action: applyAction,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(
          `✅ Applied ${data.improvementsApplied} improvements!\n\nNew version: ${data.newVersion}\n\nNext: Re-run tests to verify improvements.`
        );
        // Optionally reload prompts or redirect to /admin/ai
      } else {
        throw new Error(data.error || "Failed to apply improvements");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to apply improvements");
    } finally {
      setApplying(false);
    }
  }

  async function generateTestCases() {
    if (!generateDescription.trim()) {
      alert("Please enter a description");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/ai-test/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: generateDescription,
          count: generateCount,
          type: "chat",
        }),
      });
      const data = await res.json();
      if (data.ok && data.testCases) {
        alert(`Generated ${data.testCases.length} test cases. Review them before saving.`);
        // Could show a modal here to review and save generated cases
        console.log("Generated test cases:", data.testCases);
      } else {
        throw new Error(data.error || "Generation failed");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to generate test cases");
    } finally {
      setGenerating(false);
    }
  }

  async function runBatchTests() {
    setRunningBatch(true);
    setBatchResults([]);
    const filtered = getFilteredTestCases();
    const results: any[] = [];

    for (const testCase of filtered) {
      try {
        const runRes = await fetch("/api/admin/ai-test/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCase }),
        });
        const runData = await runRes.json();

        if (runData.ok && runData.response?.text && testCase.expectedChecks) {
          const validateRes = await fetch("/api/admin/ai-test/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              response: runData.response.text,
              testCase,
              options: { runKeywordChecks: true },
            }),
          });
          const validateData = await validateRes.json();
          if (validateData.ok) {
            results.push({
              testCase,
              result: runData,
              validation: validateData.validation,
            });
          }
        } else {
          results.push({
            testCase,
            result: runData,
            validation: null,
          });
        }
      } catch (e: any) {
        results.push({
          testCase,
          error: e.message,
        });
      }
    }

    setBatchResults(results);
    setRunningBatch(false);
  }

  function getFilteredTestCases(): TestCase[] {
    let filtered = testCases;
    if (filterTag) {
      filtered = filtered.filter((tc) => tc.tags?.includes(filterTag));
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
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">AI Testing Interface</div>
      <ELI5
        heading="AI Testing Interface"
        items={[
          "Test chat and deck analysis responses systematically.",
          "Run individual tests or batch test all cases.",
          "Auto-validate responses against expected checks (keywords, cards, length).",
          "Optional LLM fact-checking and reference comparison.",
          "Track results over time to measure improvements.",
          "Create custom test cases from real user questions.",
        ]}
      />

      {/* Validation Options */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Validation Options</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
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
            LLM Fact-Check
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
            Reference Compare
          </label>
        </div>
      </section>

      {/* Filters and Search */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Filters</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
        </div>
        <div className="text-xs opacity-70">
          Showing {filteredCases.length} of {testCases.length} test cases
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
        <button
          onClick={generateTestCases}
          disabled={generating || !generateDescription.trim()}
          className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-sm"
        >
          {generating ? "Generating..." : "Generate Test Cases"}
        </button>
      </section>

      {/* Batch Test Controls */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Batch Testing</div>
          {batchResults.length > 0 && (
            <div className="text-sm">
              Results:{" "}
              <span className="text-green-400">{passCount} passed</span> /{" "}
              <span className="text-red-400">{failCount} failed</span> /{" "}
              {batchResults.length - passCount - failCount} errors
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={runBatchTests}
            disabled={runningBatch || filteredCases.length === 0}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm"
          >
            {runningBatch ? "Running..." : `Run All (${filteredCases.length})`}
          </button>
          {batchResults.length > 0 && failCount > 0 && (
            <button
              onClick={analyzeFailures}
              disabled={analyzing}
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-sm"
            >
              {analyzing ? "Analyzing..." : "🤖 Auto-Improve"}
            </button>
          )}
          {batchResults.length > 0 && (
            <>
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
                Export JSON
              </button>
              <button
                onClick={() => {
                  // Export as CSV
                  const headers = ["Test Case", "Status", "Score", "Response Length", "Errors"];
                  const rows = batchResults.map((r) => {
                    const status = r.validation?.overall?.passed ? "PASSED" : "FAILED";
                    const score = r.validation?.overall?.score || 0;
                    const responseLength = r.result?.response?.text?.length || 0;
                    const errors = r.validation?.keywordResults?.checks
                      ?.filter((c: any) => !c.passed)
                      .map((c: any) => c.message)
                      .join("; ") || "";
                    return [
                      r.testCase.name,
                      status,
                      score,
                      responseLength,
                      errors,
                    ];
                  });
                  const csv = [headers.join(","), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `test-results-${Date.now()}.csv`;
                  a.click();
                }}
                className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-800 text-sm"
              >
                Export CSV
              </button>
            </>
          )}
        </div>
      </section>

      {/* Test Cases List */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Test Cases</div>
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
                    <div className="font-medium text-sm">{testCase.name}</div>
                    <div className="text-xs opacity-70 mt-1">
                      {testCase.type} • {testCase.source || "curated"}
                    </div>
                    {testCase.tags && testCase.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
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
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runTest(testCase);
                    }}
                    disabled={loading}
                    className="ml-2 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-60"
                  >
                    Run
                  </button>
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
              </div>
            </div>
          )}
        </section>
      )}

      {/* Batch Results Summary */}
      {batchResults.length > 0 && (
        <section className="rounded border border-neutral-800 p-3 space-y-2">
          <div className="font-medium">Batch Test Results</div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {batchResults.map((result, idx) => (
              <div
                key={idx}
                className={`p-2 rounded border ${
                  result.validation?.overall?.passed
                    ? "border-green-800 bg-green-950/20"
                    : result.validation?.overall?.passed === false
                    ? "border-red-800 bg-red-950/20"
                    : "border-neutral-700 bg-neutral-950/40"
                }`}
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
                    {result.error && (
                      <div className="text-xs text-red-400 mt-1">Error: {result.error}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                    className="ml-2 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
                  >
                    {expandedResult === idx ? "Hide" : "Details"}
                  </button>
                </div>

                {expandedResult === idx && (
                  <div className="mt-3 pt-3 border-t border-neutral-700 space-y-3">
                    {/* Response Preview */}
                    {result.result?.response?.text && (
                      <div>
                        <div className="text-xs font-medium mb-1">Response:</div>
                        <div className="p-2 rounded bg-neutral-950 border border-neutral-700 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {result.result.response.text}
                        </div>
                      </div>
                    )}

                    {/* Validation Details */}
                    {result.validation?.keywordResults && (
                      <div>
                        <div className="text-xs font-medium mb-1">Validation Checks:</div>
                        <div className="space-y-1">
                          {result.validation.keywordResults.checks.map((check: any, checkIdx: number) => (
                            <div
                              key={checkIdx}
                              className={`text-[11px] p-1.5 rounded ${
                                check.passed
                                  ? "bg-green-950/30 text-green-300"
                                  : "bg-red-950/30 text-red-300"
                              }`}
                            >
                              {check.passed ? "✅" : "❌"} {check.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LLM Fact-Check Results */}
                    {result.validation?.llmResults && (
                      <div>
                        <div className="text-xs font-medium mb-1">LLM Fact-Check:</div>
                        <div className="text-[11px] p-1.5 rounded bg-neutral-900">
                          Score: {result.validation.llmResults.score}%
                          {result.validation.llmResults.warnings.length > 0 && (
                            <div className="mt-1 text-red-300">
                              Warnings: {result.validation.llmResults.warnings.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Test Case Input */}
                    <div>
                      <div className="text-xs font-medium mb-1">Test Input:</div>
                      <div className="p-2 rounded bg-neutral-950 border border-neutral-700 text-[11px]">
                        <div>Type: {result.testCase.type}</div>
                        <div className="mt-1">
                          User Message: {result.testCase.input.userMessage || "N/A"}
                        </div>
                        {result.testCase.input.format && (
                          <div>Format: {result.testCase.input.format}</div>
                        )}
                        {result.testCase.input.commander && (
                          <div>Commander: {result.testCase.input.commander}</div>
                        )}
                        {result.testCase.expectedChecks && (
                          <div className="mt-2">
                            <div className="font-medium">Expected Checks:</div>
                            <pre className="mt-1 text-[10px] opacity-80">
                              {JSON.stringify(result.testCase.expectedChecks, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Improvement Suggestions */}
      {improvementSuggestions && (
        <section className="rounded border border-purple-800 bg-purple-950/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">🤖 Auto-Improvement Suggestions</div>
            <div className="flex gap-2">
              <select
                value={applyAction}
                onChange={(e) => setApplyAction(e.target.value as any)}
                className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                title="How to apply: append (add to end), prepend (add to start), replace (merge intelligently)"
              >
                <option value="append">Append</option>
                <option value="prepend">Prepend</option>
                <option value="replace">Replace</option>
              </select>
              <button
                onClick={applyImprovements}
                disabled={applying || selectedSuggestions.size === 0}
                className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm"
              >
                {applying ? "Applying..." : `Apply Selected (${selectedSuggestions.size})`}
              </button>
              <button
                onClick={() => {
                  const allIndices = new Set<number>(
                    improvementSuggestions.analysis?.suggestions?.map((_: any, idx: number) => idx) || []
                  );
                  setSelectedSuggestions(allIndices);
                }}
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedSuggestions(new Set())}
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
              >
                Clear
              </button>
              <button
                onClick={() => setImprovementSuggestions(null)}
                className="text-xs opacity-70 hover:opacity-100"
              >
                Close
              </button>
            </div>
          </div>

          {improvementSuggestions.failureCount > 0 && (
            <div className="text-sm opacity-80">
              Analyzed {improvementSuggestions.failureCount} failure(s)
            </div>
          )}

          {improvementSuggestions.analysis?.summary && (
            <div className="p-2 rounded bg-neutral-950 border border-neutral-700 text-sm">
              <div className="font-medium mb-1">Summary:</div>
              <div>{improvementSuggestions.analysis.summary}</div>
            </div>
          )}

          {improvementSuggestions.analysis?.suggestions && (
            <div className="space-y-3">
              <div className="font-medium text-sm">Suggested Prompt Improvements:</div>
              {improvementSuggestions.analysis.suggestions.map((suggestion: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded border ${
                    selectedSuggestions.has(idx)
                      ? suggestion.priority === "high"
                        ? "border-red-600 bg-red-950/40"
                        : suggestion.priority === "medium"
                        ? "border-yellow-600 bg-yellow-950/40"
                        : "border-blue-600 bg-blue-950/40"
                      : suggestion.priority === "high"
                      ? "border-red-800 bg-red-950/20"
                      : suggestion.priority === "medium"
                      ? "border-yellow-800 bg-yellow-950/20"
                      : "border-blue-800 bg-blue-950/20"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(idx)}
                        onChange={(e) => {
                          const newSet = new Set(selectedSuggestions);
                          if (e.target.checked) {
                            newSet.add(idx);
                          } else {
                            newSet.delete(idx);
                          }
                          setSelectedSuggestions(newSet);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {suggestion.priority === "high" && "🔴 "}
                          {suggestion.priority === "medium" && "🟡 "}
                          {suggestion.priority === "low" && "🔵 "}
                          {suggestion.category || "General"}
                        </div>
                        <div className="text-xs opacity-70 mt-1">
                          Affects: {suggestion.affectedTests?.join(", ") || "Multiple tests"}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800">
                      {suggestion.priority || "medium"}
                    </span>
                  </div>

                  <div className="text-sm space-y-2">
                    <div>
                      <div className="font-medium text-xs opacity-70">Issue:</div>
                      <div className="text-xs">{suggestion.issue}</div>
                    </div>

                    <div>
                      <div className="font-medium text-xs opacity-70">Current Behavior:</div>
                      <div className="text-xs opacity-80">{suggestion.currentBehavior}</div>
                    </div>

                    <div>
                      <div className="font-medium text-xs opacity-70">Suggested Prompt Addition:</div>
                      <div className="p-2 mt-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-xs whitespace-pre-wrap">
                        {suggestion.suggestedPromptAddition}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(suggestion.suggestedPromptAddition);
                          alert("Copied to clipboard!");
                        }}
                        className="mt-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
                      >
                        Copy to Clipboard
                      </button>
                    </div>

                    {suggestion.rationale && (
                      <div>
                        <div className="font-medium text-xs opacity-70">Why this helps:</div>
                        <div className="text-xs opacity-80">{suggestion.rationale}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-2 rounded bg-neutral-950 border border-neutral-700 text-xs space-y-2">
            <div className="opacity-70">
              💡 <strong>Workflow:</strong> Select improvements → Click "Apply Selected" → Re-run tests → Repeat
            </div>
            <div className="opacity-70">
              📝 Applied improvements are saved to your system prompt in{" "}
              <a href="/admin/ai" target="_blank" className="text-blue-400 hover:underline">
                /admin/ai
              </a>
              . You can review and edit them there.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

