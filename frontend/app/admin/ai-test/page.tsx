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
    runLLMFactCheck: true, // Default ON for judge
    runReferenceCompare: true, // Default ON for reference checks
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

  // Load test cases
  React.useEffect(() => {
    loadTestCases();
    loadPromptVersions();
  }, []);

  async function loadTestCases() {
    try {
      const r = await fetch("/api/admin/ai-test/cases?includeFailures=true", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setTestCases(j.testCases || []);
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
        }),
      });

      const batchData = await batchRes.json();
      if (batchData.ok) {
        setBatchResults(batchData.results || []);
        
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
        // Store eval run ID for later reference
        if (batchData.evalRunId) {
          console.log("Eval run created:", batchData.evalRunId);
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
    <div className="max-w-[1800px] mx-auto p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-xl font-semibold">AI Testing Interface</div>
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

      {/* 2-Column Layout */}
      <div className="grid grid-cols-[1fr_500px] gap-4">
        {/* LEFT COLUMN: Tests */}
        <div className="space-y-4">
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
              checked={autoMergeEnabled}
              onChange={(e) => setAutoMergeEnabled(e.target.checked)}
            />
            <span className="text-yellow-400">Auto-Merge Passing Patches</span>
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
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
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
                    {result.validation?.llmJudge && (
                      <div className="text-[10px] mt-1 opacity-70">
                        Judge: {result.validation.llmJudge.overall_score}% (F:{result.validation.llmJudge.factual_score} L:{result.validation.llmJudge.legality_score} S:{result.validation.llmJudge.synergy_score} P:{result.validation.llmJudge.pedagogy_score})
                      </div>
                    )}
                    {result.error && (
                      <div className="text-xs text-red-400 mt-1">Error: {result.error}</div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleResultExpansion(idx, result)}
                    className="ml-2 px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded"
                  >
                    {expandedResults.has(idx) ? "▼" : "▶"}
                  </button>
                </div>
                
                {/* Expanded Content */}
                {expandedResults.has(idx) && (
                  <div className="mt-3 pt-3 border-t border-neutral-700 space-y-3">
                    {/* AI Response */}
                    <div>
                      <div className="text-xs font-medium mb-1">AI Response:</div>
                      <div className="p-2 bg-neutral-950 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {result.result?.response?.text || result.response?.text || "No response"}
                      </div>
                    </div>
                    
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
                      setTimeout(() => {
                        loadPromptVersions();
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

          {/* Eval Runs History */}
          {evalRuns.length > 0 && (
        <section className="rounded border border-neutral-800 p-3 space-y-2">
          <div className="font-medium">Eval Runs History</div>
          <div className="space-y-2">
            <div className="text-xs opacity-70 mb-2">Select two runs to compare:</div>
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
                          {run.status} - {new Date(run.created_at).toLocaleString()}
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
                      {run.meta.pass_count}/{run.meta.test_count} passed | Prompt: {run.meta.prompt_version || "unknown"}
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
                <div className="text-sm font-medium mb-2 capitalize">{kind} Prompts</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {promptVersions[kind].map((version: any) => (
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
                  ))}
                </div>
              </div>
            ))}
            {selectedPromptVersion && (
              <div className="mt-4 p-3 rounded border border-neutral-700 bg-neutral-950/60">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium text-sm">
                    {selectedPromptVersion.version.version} ({selectedPromptVersion.kind})
                  </div>
                  <button
                    onClick={() => setSelectedPromptVersion(null)}
                    className="text-xs px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded"
                  >
                    Close
                  </button>
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

