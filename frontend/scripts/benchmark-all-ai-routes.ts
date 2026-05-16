import { spawn } from "node:child_process";

type SuiteSummary = {
  ok?: boolean;
  total?: number;
  passed?: number;
  failed?: number;
  byGroup?: Record<string, { total?: number; passed?: number; failed?: number }>;
  failedCases?: unknown[];
};

type CombinedSummary = {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  suites: Record<string, SuiteSummary>;
  byGroup: Record<string, { total: number; passed: number; failed: number }>;
  failedCases: Array<{ suite: string; case: unknown }>;
};

function parseLastJsonObject(output: string): SuiteSummary {
  const start = output.lastIndexOf("\n{");
  const raw = (start >= 0 ? output.slice(start + 1) : output).trim();
  return JSON.parse(raw) as SuiteSummary;
}

function runScript(label: string, relativeScriptPath: string): Promise<{ label: string; summary: SuiteSummary }> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/c", "npx", "tsx", relativeScriptPath], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
          })
        : spawn("npx", ["tsx", relativeScriptPath], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
          });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const summary = parseLastJsonObject(stdout);
        if (code && code !== 0 && summary.ok !== false && summary.failed === 0) {
          reject(new Error(`[${label}] exited with code ${code} but no failing summary was parsed`));
          return;
        }
        resolve({ label, summary });
      } catch (error) {
        reject(
          new Error(
            `[${label}] Could not parse summary JSON.\nSTDERR:\n${stderr}\nSTDOUT tail:\n${stdout.slice(-3000)}\nOriginal error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}

function mergeGroupSummary(
  byGroup: CombinedSummary["byGroup"],
  suiteByGroup: SuiteSummary["byGroup"] | undefined,
) {
  for (const [group, stats] of Object.entries(suiteByGroup || {})) {
    const existing = byGroup[group] || { total: 0, passed: 0, failed: 0 };
    const total = Number(stats.total || 0);
    const passed = Number(stats.passed ?? (stats.total || 0) - (stats.failed || 0));
    const failed = Number(stats.failed ?? total - passed);
    byGroup[group] = {
      total: existing.total + total,
      passed: existing.passed + passed,
      failed: existing.failed + failed,
    };
  }
}

async function main() {
  const suites = await Promise.all([
    runScript("recommendations", "scripts/benchmark-recommendation-suite.ts"),
    runScript("ai_pipelines", "scripts/benchmark-ai-pipeline-suite.ts"),
  ]);

  const combined: CombinedSummary = {
    ok: true,
    total: 0,
    passed: 0,
    failed: 0,
    suites: {},
    byGroup: {},
    failedCases: [],
  };

  for (const suite of suites) {
    combined.suites[suite.label] = suite.summary;
    combined.total += Number(suite.summary.total || 0);
    combined.passed += Number(suite.summary.passed || 0);
    combined.failed += Number(suite.summary.failed || 0);
    mergeGroupSummary(combined.byGroup, suite.summary.byGroup);
    for (const failedCase of suite.summary.failedCases || []) {
      combined.failedCases.push({ suite: suite.label, case: failedCase });
    }
  }

  combined.ok = combined.failed === 0;
  console.log(JSON.stringify(combined, null, 2));
  if (!combined.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
