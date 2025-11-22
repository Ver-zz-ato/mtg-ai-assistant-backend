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
      }
    } catch (e) {
      console.error("Failed to load test cases:", e);
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
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

