#!/usr/bin/env node
/**
 * Cost/Quality Regression Harness — single command to verify AI cost and quality.
 * Run: npm run verify:ai [-- --days 7] [-- --limit 50] [-- --skip-db] [-- --require-db]
 * Writes docs/COST_QUALITY_REPORT.md. Exit 1 if unit tests or tier replay fail.
 * With --require-db: exit 1 if DB env missing or DB checks skip.
 */

import { spawnSync } from "child_process";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const docsDir = path.resolve(projectRoot, "..", "docs");
const reportPath = path.join(docsDir, "COST_QUALITY_REPORT.md");

// Load env: .env.local then .env (override: false so OS env wins)
for (const base of [projectRoot, path.resolve(projectRoot, "..")]) {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(base, name);
    if (existsSync(p)) {
      dotenv.config({ path: p, override: false });
    }
  }
}

const argv = process.argv.slice(2);
const skipDb = argv.includes("--skip-db");
const requireDb = argv.includes("--require-db");
const days = parseInt(argv.find((a) => a.startsWith("--days="))?.split("=")[1] || argv[argv.indexOf("--days") + 1], 10) || 7;
const limit = parseInt(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || argv[argv.indexOf("--limit") + 1], 10) || 50;

const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const hasServiceRoleKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const hasSupabase = hasSupabaseUrl && hasServiceRoleKey;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: projectRoot,
    encoding: "utf-8",
    shell: true,
    ...opts,
  });
  return { ...r, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function runWithProof(name, cmd, args) {
  const start = Date.now();
  const startTs = new Date().toISOString();
  const result = run(cmd, args);
  const endTs = new Date().toISOString();
  const durationMs = Date.now() - start;
  return {
    name,
    startTs,
    endTs,
    durationMs,
    command: [cmd, ...args].join(" "),
    exitCode: result.status,
    skippedReason: null,
    result,
  };
}

const results = {
  timestamp: new Date().toISOString(),
  unitTests: { status: "PENDING", notes: "", proof: null },
  costAudit: { status: "PENDING", notes: "", proof: null },
  qualitySentinel: { status: "PENDING", notes: "", proof: null },
  tierReplay: { status: "PENDING", notes: "", proof: null },
  panicSwitches: { status: "PENDING", notes: "", proof: null },
  skipped: [],
};

const tsxPath = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const tsxCmd = existsSync(tsxPath) ? "node" : "npx";
const tsxArgs = existsSync(tsxPath) ? [tsxPath] : ["tsx"];

// 1. Unit tests (pricing + panic-switches)
const unitProof = runWithProof("pricing", tsxCmd, [...tsxArgs, "tests/unit/pricing.test.ts"]);
const panicProof = runWithProof("panic-switches", tsxCmd, [...tsxArgs, "tests/unit/panic-switches.test.ts"]);

const unitOk = unitProof.exitCode === 0 && panicProof.exitCode === 0;
results.unitTests.status = unitOk ? "PASS" : "FAIL";
results.unitTests.notes = unitOk ? "" : (unitProof.result.stderr || unitProof.result.stdout || "").slice(0, 500);
results.unitTests.proof = { ...unitProof, name: "unit tests (pricing)" };
results.panicSwitches.status = panicProof.exitCode === 0 ? "PASS" : "FAIL";
results.panicSwitches.proof = panicProof;

// 2. Cost audit
let auditData = { skipped: true, reason: "Skipped (--skip-db or no Supabase keys)" };
let auditProof = null;
if (!skipDb && hasSupabase) {
  auditProof = runWithProof("cost audit", "node", [
    "scripts/audit-ai-usage-cost.mjs",
    "--limit",
    String(limit),
    "--days",
    String(days),
    "--json",
  ]);
  try {
    const out = auditProof.result.stdout.trim();
    const lastLine = out.split("\n").filter(Boolean).pop();
    auditData = JSON.parse(lastLine || "{}");
  } catch {
    auditData = { skipped: true, reason: "Parse error" };
  }
} else {
  auditProof = {
    name: "cost audit",
    startTs: new Date().toISOString(),
    endTs: new Date().toISOString(),
    durationMs: 0,
    command: "(skipped)",
    exitCode: null,
    skippedReason: skipDb ? "Skipped (--skip-db)" : "No Supabase keys",
  };
}
if (auditData.skipped) {
  results.costAudit.status = "SKIP";
  results.costAudit.notes = auditData.reason || "No Supabase keys";
  results.costAudit.proof = auditProof;
  results.skipped.push("Cost audit");
} else {
  results.costAudit.status = auditData.mismatchCount > 0 ? "WARN" : "PASS";
  results.costAudit.notes = `${auditData.rowsChecked || 0} rows, ${auditData.mismatchCount || 0} mismatches`;
  results.costAudit.proof = auditProof;
}

// 3. Quality Sentinel
let sentinelData = { skipped: true, reason: skipDb ? "Skipped (--skip-db)" : "No Supabase keys" };
let sentinelProof = null;
if (!skipDb && hasSupabase) {
  sentinelProof = runWithProof("quality sentinel", "node", ["scripts/quality-sentinel.mjs", String(days), "--json"]);
  try {
    const out = sentinelProof.result.stdout.trim();
    const lastLine = out.split("\n").filter(Boolean).pop();
    sentinelData = JSON.parse(lastLine || "{}");
  } catch {
    sentinelData = { skipped: true };
  }
} else {
  sentinelProof = {
    name: "quality sentinel",
    startTs: new Date().toISOString(),
    endTs: new Date().toISOString(),
    durationMs: 0,
    command: "(skipped)",
    exitCode: null,
    skippedReason: skipDb ? "Skipped (--skip-db)" : "No Supabase keys",
  };
}
if (sentinelData.skipped) {
  results.qualitySentinel.status = "SKIP";
  results.qualitySentinel.notes = sentinelData.reason || "No Supabase keys";
  results.qualitySentinel.proof = sentinelProof;
  if (!results.skipped.includes("Quality Sentinel")) results.skipped.push("Quality Sentinel");
} else {
  const warnCount = (sentinelData.warnings || []).length;
  results.qualitySentinel.status = warnCount > 0 ? "WARN" : "PASS";
  results.qualitySentinel.notes = warnCount > 0 ? `${warnCount} threshold(s) triggered` : `${sentinelData.totalRequests || 0} requests`;
  results.qualitySentinel.proof = sentinelProof;
}

// 4. Tier replay
const replayProof = runWithProof("tier replay", tsxCmd, [...tsxArgs, "scripts/replay-tier-classification.mjs", "--json"]);
let replayData = { passed: 0, failed: 0 };
try {
  const out = replayProof.result.stdout.trim();
  const lastLine = out.split("\n").filter(Boolean).pop();
  replayData = JSON.parse(lastLine || "{}");
} catch {
  replayData = { passed: 0, failed: 1 };
}
results.tierReplay.status = replayData.failed > 0 ? "FAIL" : "PASS";
results.tierReplay.notes = `${replayData.passed || 0} passed, ${replayData.failed || 0} failed`;
results.tierReplay.proof = replayProof;

// Count executed checks
const totalChecks = 5;
const executedChecks = [
  results.unitTests.status !== "PENDING",
  results.costAudit.status !== "SKIP",
  results.qualitySentinel.status !== "SKIP",
  results.tierReplay.status !== "PENDING",
  results.panicSwitches.status !== "PENDING",
].filter(Boolean).length;
const dbChecksExecuted = results.costAudit.status !== "SKIP" && results.qualitySentinel.status !== "SKIP";

// --require-db: fail if DB required but skipped
let requireDbFail = false;
let requireDbReason = "";
if (requireDb) {
  if (!hasSupabase) {
    requireDbFail = true;
    requireDbReason = `Missing env: hasSupabaseUrl=${hasSupabaseUrl}, hasServiceRoleKey=${hasServiceRoleKey}. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`;
  } else if (skipDb) {
    requireDbFail = true;
    requireDbReason = "DB checks skipped due to --skip-db. Remove --skip-db when using --require-db.";
  } else if (results.costAudit.status === "SKIP" || results.qualitySentinel.status === "SKIP") {
    requireDbFail = true;
    requireDbReason = `DB checks skipped: cost audit=${results.costAudit.status}, quality sentinel=${results.qualitySentinel.status}.`;
  }
}

// Build report
const proofSection = (p) => {
  if (!p) return "";
  return [
    `- start: ${p.startTs}`,
    `- end: ${p.endTs}`,
    `- duration_ms: ${p.durationMs}`,
    `- command: ${p.command}`,
    `- exit_code: ${p.exitCode ?? "N/A"}`,
    p.skippedReason ? `- skipped_reason: ${p.skippedReason}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const report = `# Cost/Quality Verification Report
Generated: ${results.timestamp}

## Env check

| Variable | Value |
|----------|-------|
| hasSupabaseUrl | ${hasSupabaseUrl} |
| hasServiceRoleKey | ${hasServiceRoleKey} |
| requireDb | ${requireDb} |

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| Unit tests (pricing + panic switches) | ${results.unitTests.status} | ${results.unitTests.notes || "—"} |
| Cost audit | ${results.costAudit.status} | ${results.costAudit.notes} |
| Quality Sentinel | ${results.qualitySentinel.status} | ${results.qualitySentinel.notes} |
| Tier replay | ${results.tierReplay.status} | ${results.tierReplay.notes} |
| Panic switch tests | ${results.panicSwitches.status} | ${results.panicSwitches.notes || "—"} |

**Executed checks:** ${executedChecks}/${totalChecks}
**DB checks executed:** ${dbChecksExecuted ? "yes" : "no"}
${requireDbFail ? `\n**--require-db FAIL:** ${requireDbReason}` : ""}

## Proof of execution

### Unit tests (pricing)
\`\`\`
${proofSection(results.unitTests.proof)}
\`\`\`

### Panic switch tests
\`\`\`
${proofSection(results.panicSwitches.proof)}
\`\`\`

### Cost audit
\`\`\`
${proofSection(results.costAudit.proof)}
\`\`\`

### Quality Sentinel
\`\`\`
${proofSection(results.qualitySentinel.proof)}
\`\`\`

### Tier replay
\`\`\`
${proofSection(results.tierReplay.proof)}
\`\`\`

## Cost Audit

${auditData.skipped ? `Skipped: ${auditData.reason}` : `Rows checked: ${auditData.rowsChecked || 0}. Mismatches: ${auditData.mismatchCount || 0}.${auditData.mismatchCount > 0 ? `\n\nSample: ${JSON.stringify((auditData.sampleMismatches || []).slice(0, 5))}` : " All costs consistent with pricing.ts."}`}

## Quality Sentinel

${sentinelData.skipped ? `Skipped: ${sentinelData.reason || "No Supabase keys"}` : `Total requests: ${sentinelData.totalRequests || 0} (last ${days} days).\n\nWarnings: ${(sentinelData.warnings || []).length > 0 ? JSON.stringify(sentinelData.warnings, null, 2) : "None."}`}

## Tier Replay

${replayData.passed || 0} passed, ${replayData.failed || 0} failed.
${(replayData.failures || []).length > 0 ? `\nFailures:\n${(replayData.failures || []).map((f) => `- ${f.id}: ${f.issues?.join("; ")}`).join("\n")}` : ""}

## Warnings / Thresholds Triggered

${(sentinelData.warnings || []).length > 0 ? (sentinelData.warnings || []).map((w) => `- ${w.type}: ${JSON.stringify(w)}`).join("\n") : "None."}

## What to do if failing

- **Unit tests:** Fix \`pricing.ts\` or panic switch logic in \`chat-generation-config.ts\` / route handlers.
- **Cost audit:** Investigate mismatches; ensure \`pricing.ts\` matches stored \`cost_usd\` formula. Check for 1K/1M unit flips.
- **Tier replay:** Update \`quality-sentinel-prompts.json\` or fix \`prompt-tier.ts\` / \`layer0-gate.ts\`.
- **Quality warnings:** Review value-moment routes; consider enabling \`llm_force_full_routes\` for affected routes.
- **--require-db fail:** Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or remove --require-db.

## If you think we went too far

Set in \`app_config\` (via Admin API or Supabase):

\`\`\`json
{
  "llm_force_full_routes": ["deck_analyze", "swap_suggestions", "swap_why", "suggestion_why", "deck_scan", "deck_compare"],
  "llm_min_tokens_per_route": {
    "deck_analyze": 256,
    "swap_suggestions": 256,
    "chat": 256,
    "chat_stream": 256
  }
}
\`\`\`

**Exact commands:**
- Admin UI: \`/admin/ai-usage\` → Config tab → edit \`llm_force_full_routes\` and \`llm_min_tokens_per_route\`
- Or \`GET/POST /api/admin/ai/config\` with the above keys

## Skipped Checks

${results.skipped.length > 0 ? results.skipped.join(", ") + " (missing Supabase keys or --skip-db)" : "None."}
`;

if (!existsSync(docsDir)) {
  mkdirSync(docsDir, { recursive: true });
}
writeFileSync(reportPath, report, "utf-8");

const failRequired = !unitOk || replayData.failed > 0 || requireDbFail;
if (failRequired) {
  if (requireDbFail) {
    console.error("verify:ai FAILED (--require-db):", requireDbReason);
  } else {
    console.error("verify:ai FAILED — unit tests or tier replay failed. See", reportPath);
  }
  process.exit(1);
}
console.log("verify:ai PASSED. Report written to", reportPath);
process.exit(0);
