/**
 * Vision endpoint only — separate from disambiguate to avoid guest rate limits.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SCAN_AI_BASE_URL ?? "https://www.manatap.ai").replace(/\/$/, "");
const img = readFileSync(join(process.cwd(), "tests", "fixtures", "scan-smoke-bolt.jpg"));

async function vision(assistMode: string, scanContext?: string) {
  const form = new FormData();
  form.append("image", new Blob([img], { type: "image/jpeg" }), "bolt.jpg");
  form.append("assistMode", assistMode);
  form.append("imageRole", assistMode === "improve" ? "full" : "title");
  form.append("usageSource", "manatap_app");
  if (scanContext) form.append("scanContext", scanContext);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/cards/recognize-image`, {
    method: "POST",
    headers: {
      "X-ManaTap-Client": "manatap_app",
      "X-Analytics-Session-Id": `vision-${assistMode}-${Date.now()}`,
    },
    body: form,
    signal: controller.signal,
  });
  clearTimeout(t);
  const json = await res.json().catch(() => ({}));
  return { res, json, ms: Date.now() - t0 };
}

async function main() {
  const ctx = JSON.stringify({
    normalizedOcrText: "lightning b0lt",
    fuzzyMatches: [
      { name: "Lightning Bolt", score: 0.55 },
      { name: "Lightning Strike", score: 0.5 },
    ],
    aiTriggerReason: "low_top_score",
  });

  console.log("fallback + scanContext...");
  const fb = await vision("fallback", ctx);
  console.log(`  ${fb.ms}ms status=${fb.res.status}`, JSON.stringify(fb.json).slice(0, 500));

  console.log("improve guest (no auth)...");
  const imp = await vision("improve");
  console.log(`  ${imp.ms}ms status=${imp.res.status}`, JSON.stringify(imp.json).slice(0, 300));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
