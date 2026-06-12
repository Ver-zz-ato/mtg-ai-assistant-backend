#!/usr/bin/env tsx
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

const STRICT_APP = `
  (
    properties.$lib = 'posthog-react-native'
    OR properties.platform = 'app'
    OR properties.app_surface = 'mobile_app'
    OR properties.source = 'manatap_app'
  )
`;

async function main() {
  const [users, sessions, scannerSessions, hourly] = await Promise.all([
    posthogHogql(`
      SELECT
        uniq(distinct_id) AS distinct_users,
        uniq(properties.session_id) AS session_ids
      FROM events
      WHERE timestamp >= now() - INTERVAL 24 HOUR
        AND ${STRICT_APP}
    `),
    posthogHogql(`
      SELECT distinct_id, count() AS events
      FROM events
      WHERE timestamp >= now() - INTERVAL 24 HOUR
        AND ${STRICT_APP}
      GROUP BY distinct_id
      ORDER BY events DESC
      LIMIT 10
    `),
    posthogHogql(`
      SELECT
        count() AS scan_sessions_completed,
        uniq(distinct_id) AS users_with_scanner
      FROM events
      WHERE timestamp >= now() - INTERVAL 24 HOUR
        AND event = 'scan_card_session_completed'
        AND ${STRICT_APP}
    `),
    posthogHogql(`
      SELECT
        toStartOfHour(timestamp) AS hour,
        count() AS events
      FROM events
      WHERE timestamp >= now() - INTERVAL 24 HOUR
        AND ${STRICT_APP}
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 24
    `),
  ]);

  console.log("\n=== Strict mobile app (last 24h) ===\n");
  console.log("Distinct users:", users.results[0]?.[0]);
  console.log("Distinct session_ids:", users.results[0]?.[1]);
  console.log("Scanner sessions completed:", scannerSessions.results[0]?.[0]);
  console.log("Users who completed a scan session:", scannerSessions.results[0]?.[1]);

  console.log("\n--- Top distinct_ids by event count ---");
  for (const row of sessions.results) {
    const id = String(row[0]);
    const masked = id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
    console.log(`  ${masked.padEnd(16)} ${row[1]} events`);
  }

  console.log("\n--- Events by hour (UTC) ---");
  for (const row of hourly.results) {
    console.log(`  ${String(row[0]).slice(0, 16)}  ${row[1]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
