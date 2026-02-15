#!/usr/bin/env tsx
/**
 * Run ManaTap cron jobs manually.
 *
 * Usage:
 *   npx tsx scripts/run-crons.ts [cron-name]
 *   npx tsx scripts/run-crons.ts all
 *
 * Env: CRON_KEY or CRON_SECRET or RENDER_CRON_SECRET, NEXT_PUBLIC_APP_URL (or pass baseUrl as 2nd arg)
 *
 * Cron names: deck-costs, commander-aggregates, meta-signals, top-cards,
 *   cleanup-price-cache, cleanup-guest-sessions, cleanup-rate-limits,
 *   ops-report/daily, ops-report/weekly, price/snapshot
 */

import * as path from "path";
import * as fs from "fs";
import { config } from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

const CRON_KEY =
  process.env.CRON_KEY ||
  process.env.CRON_SECRET ||
  process.env.RENDER_CRON_SECRET ||
  "";
const BASE =
  process.argv[3] || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const CRONS: Record<string, string> = {
  "deck-costs": "/api/cron/deck-costs",
  "commander-aggregates": "/api/cron/commander-aggregates",
  "meta-signals": "/api/cron/meta-signals",
  "top-cards": "/api/cron/top-cards",
  "cleanup-price-cache": "/api/cron/cleanup-price-cache",
  "cleanup-guest-sessions": "/api/cron/cleanup-guest-sessions",
  "cleanup-rate-limits": "/api/cron/cleanup-rate-limits",
  "ops-daily": "/api/cron/ops-report/daily",
  "ops-weekly": "/api/cron/ops-report/weekly",
};

async function runCron(name: string, path: string): Promise<boolean> {
  const url = `${BASE}${path}?key=${encodeURIComponent(CRON_KEY)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: CRON_KEY ? { "x-cron-key": CRON_KEY } : {},
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.ok && (body?.ok !== false);
    console.log(ok ? "✓" : "✗", name, res.status, body?.updated ?? body?.error ?? "");
    return ok;
  } catch (e: any) {
    console.log("✗", name, "Error:", e?.message ?? e);
    return false;
  }
}

async function main() {
  const target = process.argv[2] || "all";

  if (!CRON_KEY) {
    console.log("⚠ CRON_KEY / CRON_SECRET / RENDER_CRON_SECRET not set. Crons may return 401.");
  }

  console.log("Base URL:", BASE);
  console.log("Target:", target);
  console.log("");

  if (target === "all") {
    const order = [
      "deck-costs",
      "commander-aggregates",
      "meta-signals",
      "top-cards",
    ];
    for (const name of order) {
      const p = CRONS[name];
      if (p) await runCron(name, p);
    }
    console.log("\nDone. Run 'ops-daily' or 'ops-weekly' separately if needed.");
    return;
  }

  const p = CRONS[target];
  if (!p) {
    console.log("Unknown cron:", target);
    console.log("Available:", Object.keys(CRONS).join(", "));
    process.exit(1);
  }

  await runCron(target, p);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
