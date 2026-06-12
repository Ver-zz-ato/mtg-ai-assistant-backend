#!/usr/bin/env tsx
/**
 * Audit app event counts vs strict mobile attribution (last 24h).
 */
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

import { posthogHogql } from "@/lib/server/posthog-hogql";

const CURRENT_APP_FILTER = `
  (
    event LIKE 'tool_%'
    OR event LIKE 'scan_%'
    OR event LIKE 'pro_%'
    OR event LIKE 'paywall_%'
    OR event LIKE 'feedback_%'
    OR event LIKE 'chat_%'
    OR event LIKE 'voice_%'
    OR event LIKE 'hero_%'
    OR event LIKE 'home_%'
    OR event LIKE 'analysis_%'
    OR properties.$lib = 'posthog-react-native'
    OR properties.platform = 'app'
    OR properties.source = 'manatap_app'
  )
`;

const STRICT_APP_FILTER = `
  (
    properties.$lib = 'posthog-react-native'
    OR properties.platform = 'app'
    OR properties.app_surface = 'mobile_app'
    OR properties.source = 'manatap_app'
  )
`;

async function main() {
  const hours = 24;

  const [totals, topEvents, strictTop, bySurface] = await Promise.all([
    posthogHogql(`
      SELECT
        countIf(${CURRENT_APP_FILTER}) AS current_digest_total,
        countIf(${STRICT_APP_FILTER}) AS strict_app_total,
        countIf(${CURRENT_APP_FILTER} AND NOT (${STRICT_APP_FILTER})) AS likely_web_leak
      FROM events
      WHERE timestamp >= now() - INTERVAL ${hours} HOUR
    `),
    posthogHogql(`
      SELECT event, count() AS count
      FROM events
      WHERE timestamp >= now() - INTERVAL ${hours} HOUR
        AND ${CURRENT_APP_FILTER}
      GROUP BY event
      ORDER BY count DESC
      LIMIT 25
    `),
    posthogHogql(`
      SELECT event, count() AS count
      FROM events
      WHERE timestamp >= now() - INTERVAL ${hours} HOUR
        AND ${STRICT_APP_FILTER}
      GROUP BY event
      ORDER BY count DESC
      LIMIT 25
    `),
    posthogHogql(`
      SELECT
        coalesce(toString(properties.app_surface), coalesce(toString(properties.platform), 'unknown')) AS surface,
        count() AS count
      FROM events
      WHERE timestamp >= now() - INTERVAL ${hours} HOUR
        AND ${CURRENT_APP_FILTER}
      GROUP BY surface
      ORDER BY count DESC
      LIMIT 15
    `),
  ]);

  const t = totals.results[0] || [];
  console.log(`\n=== App events audit (last ${hours}h) ===\n`);
  console.log("Current digest filter total:", t[0]);
  console.log("Strict mobile-only total:   ", t[1]);
  console.log("Likely website leak:        ", t[2]);

  console.log("\n--- Top events (current digest filter) ---");
  for (const row of topEvents.results) {
    console.log(`  ${String(row[0]).padEnd(40)} ${row[1]}`);
  }

  console.log("\n--- Top events (strict mobile only) ---");
  if (strictTop.results.length === 0) {
    console.log("  (none)");
  } else {
    for (const row of strictTop.results) {
      console.log(`  ${String(row[0]).padEnd(40)} ${row[1]}`);
    }
  }

  console.log("\n--- By app_surface / platform (current filter) ---");
  for (const row of bySurface.results) {
    console.log(`  ${String(row[0]).padEnd(24)} ${row[1]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
