#!/usr/bin/env node
/**
 * Generates a markdown summary from comprehensive test results.
 * Run after: npm run test:comprehensive
 * Reads: test-results/comprehensive-results.json
 * Outputs: test-results/comprehensive-summary.md
 */

import fs from 'fs';
import path from 'path';

const resultsPath = path.join(process.cwd(), 'test-results/comprehensive-results.json');
const outputPath = path.join(process.cwd(), 'test-results/comprehensive-summary.md');

if (!fs.existsSync(resultsPath)) {
  console.error('No results found. Run: npm run test:comprehensive');
  process.exit(1);
}

const raw = fs.readFileSync(resultsPath, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error('Invalid JSON in results file');
  process.exit(1);
}

const stats = { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0, duration: 0 };
const failures = [];
const projects = new Map();

function collectSpec(spec, projectName) {
  for (const test of spec.tests || []) {
    const proj = test.projectName || projectName || 'default';
    for (const run of test.results || []) {
      stats.total++;
      stats.duration += run.duration || 0;
      if (!projects.has(proj)) projects.set(proj, { passed: 0, failed: 0, skipped: 0 });
      if (run.status === 'passed') { stats.passed++; projects.get(proj).passed++; }
      else if (run.status === 'failed') {
        stats.failed++;
        projects.get(proj).failed++;
        failures.push({
          title: spec.title,
          project: proj,
          error: run.error?.message || 'Unknown',
          stack: run.error?.stack,
        });
      } else if (run.status === 'skipped') { stats.skipped++; projects.get(proj).skipped++; }
      else if (run.status === 'flaky') stats.flaky++;
    }
  }
}

function collectSuites(suites, projectName) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) collectSpec(spec, projectName);
    collectSuites(suite.suites, projectName);
  }
}

collectSuites(data.suites);

const md = `# Comprehensive Test Results

**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Count |
|--------|-------|
| **Total** | ${stats.total} |
| **Passed** | ${stats.passed} |
| **Failed** | ${stats.failed} |
| **Skipped** | ${stats.skipped} |
| **Flaky** | ${stats.flaky} |
| **Duration** | ${(stats.duration / 1000).toFixed(1)}s |

## By Project

| Project | Passed | Failed | Skipped |
|---------|--------|--------|---------|
${[...projects.entries()].map(([p, s]) => `| ${p} | ${s.passed} | ${s.failed} | ${s.skipped} |`).join('\n')}

## Failures (full details for AI)

${failures.length === 0 ? '*No failures*' : failures.map((f, i) => `
### ${i + 1}. ${f.title}
**Project:** ${f.project}
**Error:**
\`\`\`
${f.error || 'Unknown'}
\`\`\`
${f.stack ? `**Stack:**\n\`\`\`\n${f.stack}\n\`\`\`` : ''}
`).join('\n')}

---
*View full report: \`npm run test:comprehensive:report\`*
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, md);
console.log('Summary written to', outputPath);
console.log(`Passed: ${stats.passed}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
