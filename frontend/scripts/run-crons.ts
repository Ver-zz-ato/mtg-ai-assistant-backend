#!/usr/bin/env tsx
/**
 * Run ManaTap cron jobs manually.
 *
 * Usage:
 *   npx tsx scripts/run-crons.ts [cron-name]
 *   npx tsx scripts/run-crons.ts all
 *
 * Env: CRON_SECRET, NEXT_PUBLIC_APP_URL (or pass baseUrl as 2nd arg)
 *
 * Cron names: deck-costs, commander-aggregates, meta-signals, top-cards,
 *   cleanup-price-cache, cleanup-guest-sessions, cleanup-rate-limits,
 *   ops-report/daily, ops-report/weekly, price/snapshot, budget-swaps-update,
 *   update-banned-lists
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

const CRON_SECRET = process.env.CRON_SECRET || "";
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
  "budget-swaps-update": "/api/cron/budget-swaps-update",
  "update-banned-lists": "/api/cron/update-banned-lists",
};

async function runCron(name: string, cronPath: string): Promise<boolean> {
  // TODO: remove legacy ?key= support after all external/manual callers are migrated.
  const url = `${BASE}${cronPath}${CRON_SECRET ? `?key=${encodeURIComponent(CRON_SECRET)}` : ""}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: CRON_SECRET
        ? {
            Authorization: `Bearer ${CRON_SECRET}`,
          }
        : {},
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.ok && (body?.ok !== false);
    console.log(ok ? "ok" : "x", name, res.status, body?.updated ?? body?.error ?? "");
    return ok;
  } catch (e: any) {
    console.log("x", name, "Error:", e?.message ?? e);
    return false;
  }
}

async function main() {
  const target = process.argv[2] || "all";

  if (!CRON_SECRET) {
    console.log("WARN CRON_SECRET not set. Crons may return 401.");
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
      const cronPath = CRONS[name];
      if (cronPath) await runCron(name, cronPath);
    }
    console.log("\nDone. Run 'ops-daily' or 'ops-weekly' separately if needed.");
    return;
  }

  const cronPath = CRONS[target];
  if (!cronPath) {
    console.log("Unknown cron:", target);
    console.log("Available:", Object.keys(CRONS).join(", "));
    process.exit(1);
  }

  await runCron(target, cronPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
