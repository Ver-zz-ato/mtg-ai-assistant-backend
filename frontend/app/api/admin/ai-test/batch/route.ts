import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";
import { validateResponse } from "@/lib/ai/test-validator";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { testCases, suite, validationOptions } = body;

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return NextResponse.json({ ok: false, error: "testCases array required" }, { status: 400 });
    }

    // Get current prompt version (use first test case type to determine kind)
    const firstType = testCases[0]?.type || "chat";
    const promptKind = firstType === "deck_analysis" ? "deck_analysis" : "chat";
    const promptVersion = await getPromptVersion(promptKind);
    const promptVersionId = promptVersion?.id || null;

    // Create eval_run
    const suiteName = suite || `batch-${new Date().toISOString().slice(0, 10)}`;
    const { data: evalRun, error: evalError } = await supabase
      .from("eval_runs")
      .insert({
        suite: suiteName,
        prompts: promptVersionId ? [promptVersionId] : [],
        status: "running",
        meta: {
          test_count: testCases.length,
          prompt_kind: promptKind,
          prompt_version: promptVersion?.version || "unknown",
        },
      })
      .select("id")
      .single();

    if (evalError || !evalRun) {
      return NextResponse.json({
        ok: false,
        error: `Failed to create eval_run: ${evalError?.message || "unknown"}`,
      }, { status: 500 });
    }

    const evalRunId = evalRun.id;
    const results: any[] = [];
    const apiKey = process.env.OPENAI_API_KEY || "";

    // Create or find a single "batch-test" thread to reuse for all chat tests
    // This prevents hitting the 30-thread limit when running many tests
    let batchTestThreadId: string | null = null;
    try {
      // Try to find an existing batch test thread
      const { data: existingThread } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("user_id", user.id)
        .eq("title", "Batch Test Thread")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingThread) {
        batchTestThreadId = existingThread.id;
        console.log(`[batch] Reusing existing batch test thread: ${batchTestThreadId}`);
      } else {
        // Create a new batch test thread
        const { data: newThread, error: threadError } = await supabase
          .from("chat_threads")
          .insert({ user_id: user.id, title: "Batch Test Thread" })
          .select("id")
          .single();

        if (threadError) {
          console.warn(`[batch] Failed to create batch test thread:`, threadError);
          // Continue without thread - tests will create their own or fail
        } else {
          batchTestThreadId = newThread.id;
          console.log(`[batch] Created new batch test thread: ${batchTestThreadId}`);
        }
      }
    } catch (e) {
      console.warn(`[batch] Error setting up batch test thread:`, e);
      // Continue without thread - tests will create their own or fail
    }

    // Helper function to run a single test case
    async function runSingleTest(testCase: any): Promise<any> {
      try {
        const type = testCase.type;
        const input = testCase.input;
        let responseText = "";
        let promptUsed: any = {};
        let error: string | null = null;
        let promptVersionIdForTest = promptVersionId;

        try {
          if (type === "chat") {
            const baseUrl = req.url.split("/api/admin")[0];
            const chatResponse = await fetch(`${baseUrl}/api/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("cookie") || "",
              },
              body: JSON.stringify({
                text: input.userMessage,
                threadId: batchTestThreadId, // Reuse the batch test thread instead of creating new ones
                prefs: {
                  format: input.format,
                  teaching: input.context?.teaching || false,
                },
                context: input.context,
                noUserInsert: true, // Don't save user messages to DB for batch tests
              }),
            });

            const chatData = await chatResponse.json();
            if (!chatResponse.ok || chatData.fallback) {
              error = chatData.error || chatData.reason || `Chat API returned ${chatResponse.status}`;
              console.warn(`[batch] Chat test failed for "${testCase.name}":`, error);
            } else {
              responseText = chatData.text || "";
              promptUsed = {
                system: "[Built dynamically in /api/chat]",
                user: input.userMessage,
                prompt_version_id: chatData.prompt_version_id || promptVersionIdForTest,
              };
              promptVersionIdForTest = chatData.prompt_version_id || promptVersionIdForTest;
            }
          } else if (type === "deck_analysis") {
            const baseUrl = req.url.split("/api/admin")[0];
            const analysisResponse = await fetch(`${baseUrl}/api/deck/analyze`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("cookie") || "",
              },
              body: JSON.stringify({
                deckText: input.deckText || "",
                userMessage: input.userMessage,
                format: input.format || "Commander",
                commander: input.commander,
                colors: input.colors || [],
                plan: input.context?.plan || "Optimized",
                currency: input.context?.currency || "USD",
              }),
            });

            const analysisData = await analysisResponse.json();
            if (!analysisResponse.ok || analysisData.error) {
              error = analysisData.error || `Deck analysis API returned ${analysisResponse.status}`;
              console.warn(`[batch] Deck analysis test failed for "${testCase.name}":`, error);
            } else {
              const suggestions = analysisData.suggestions || [];
              const whatsGood = analysisData.whatsGood || [];
              const quickFixes = analysisData.quickFixes || [];

              responseText = [
                ...whatsGood.map((msg: string) => `✅ ${msg}`),
                ...quickFixes.map((msg: string) => `⚠️ ${msg}`),
                ...suggestions.map((s: any) => `💡 ${s.card}: ${s.reason || ""}`),
              ].join("\n");

              promptUsed = {
                system: "[Built dynamically in /api/deck/analyze]",
                user: input.userMessage || "Analyze this deck",
                prompt_version_id: analysisData.prompt_version_id || promptVersionIdForTest,
              };
              promptVersionIdForTest = analysisData.prompt_version_id || promptVersionIdForTest;
            }
          }
        } catch (e: any) {
          error = e.message || "Failed to run test";
        }

        // Validate response if we have one
        let validation: any = null;
        if (responseText && testCase.expectedChecks) {
          const validationOpts = {
            runKeywordChecks: validationOptions?.runKeywordChecks !== false,
            runLLMFactCheck: validationOptions?.runLLMFactCheck === true, // Respect toggle
            runReferenceCompare: validationOptions?.runReferenceCompare === true, // Respect toggle
            runSemanticCheck: validationOptions?.runSemanticCheck === true, // Semantic similarity
            runAdvancedJudges: validationOptions?.runAdvancedJudges !== false, // Default to true - new behavior judges
            apiKey: (validationOptions?.runLLMFactCheck || validationOptions?.runSemanticCheck) ? apiKey : undefined,
            supabase: supabase,
          };

          validation = await validateResponse(responseText, testCase, validationOpts);
        }

        // Save test result
        const testCaseId = testCase.id;
        if (testCaseId) {
          await supabase.from("ai_test_results").insert({
            test_case_id: testCaseId,
            eval_run_id: evalRunId,
            prompt_version_id: promptVersionIdForTest,
            response_text: responseText,
            prompt_used: promptUsed,
            validation_results: validation,
          });

          // Update test case quality metrics
          const passed = validation?.overall?.passed === true;
          const catchCount = passed ? 0 : 1; // Increment catch_count if test failed
          
          try {
            await fetch(`${req.url.split("/api/admin")[0]}/api/admin/ai-test/quality`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("cookie") || "",
              },
              body: JSON.stringify({
                testCaseId,
                passed,
                catchCount: passed ? undefined : catchCount,
              }),
            });
          } catch (e) {
            console.warn("[batch] Failed to update quality metrics:", e);
            // Don't fail the test if quality update fails
          }
        }

        return {
          testCase,
          result: {
            response: { text: responseText, promptUsed, error },
          },
          validation,
        };
      } catch (e: any) {
        return {
          testCase,
          error: e.message,
        };
      }
    }

    // Parallel execution with concurrency limit (8 concurrent tests)
    const concurrencyLimit = 8;
    const testResults: any[] = [];
    
    console.log(`[batch] Starting batch run with ${testCases.length} test cases (concurrency: ${concurrencyLimit})`);
    
    // Process tests in batches to maintain concurrency limit
    for (let i = 0; i < testCases.length; i += concurrencyLimit) {
      const batch = testCases.slice(i, i + concurrencyLimit);
      const batchNum = Math.floor(i / concurrencyLimit) + 1;
      const totalBatches = Math.ceil(testCases.length / concurrencyLimit);
      
      console.log(`[batch] Processing batch ${batchNum}/${totalBatches} (${batch.length} tests)`);
      
      const batchPromises = batch.map((testCase, idx) => 
        runSingleTest(testCase).catch((error) => {
          // Ensure errors don't crash the batch
          console.error(`[batch] Test ${testCase.id || testCase.name || `#${i + idx}`} failed:`, error);
          return {
            testCase,
            error: error?.message || "Unknown error",
            validation: null,
          };
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      testResults.push(...batchResults);
      
      console.log(`[batch] Batch ${batchNum} complete: ${batchResults.length} results`);
    }
    
    console.log(`[batch] All batches complete. Total results: ${testResults.length}`);
    results.push(...testResults);

    // Update eval_run status
    const passCount = results.filter((r) => r.validation?.overall?.passed === true).length;
    const failCount = results.filter((r) => r.validation?.overall?.passed === false).length;
    const passRate = results.length > 0 ? Math.round((passCount / results.length) * 100) : 0;

    await supabase
      .from("eval_runs")
      .update({
        status: "complete",
        meta: {
          test_count: testCases.length,
          pass_count: passCount,
          fail_count: failCount,
          pass_rate: passRate,
          prompt_kind: promptKind,
          prompt_version: promptVersion?.version || "unknown",
          validation_options: {
            runLLMFactCheck: validationOptions?.runLLMFactCheck !== false,
            runReferenceCompare: validationOptions?.runReferenceCompare !== false,
          },
        },
      })
      .eq("id", evalRunId);

    return NextResponse.json({
      ok: true,
      evalRunId,
      results,
      summary: {
        total: results.length,
        passed: passCount,
        failed: failCount,
        passRate,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

