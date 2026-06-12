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

import { getAdmin } from "@/app/api/_lib/supa";

async function main() {
  const db = getAdmin();
  if (!db) throw new Error("no admin");

  const since = new Date(Date.now() - 72 * 3600000).toISOString();
  const { data: audit } = await db
    .from("admin_audit")
    .select("created_at,action,target,details,actor_id")
    .eq("action", "bulk_price_import")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("\nadmin_audit bulk_price_import (last 72h):\n");
  if (!audit?.length) console.log("  (none)");
  else for (const row of audit) console.log(`  ${row.created_at} actor=${row.actor_id} target=${row.target} ${row.details ?? ""}`);

  const { data: snap } = await db
    .from("admin_audit")
    .select("created_at,action")
    .in("action", ["price_snapshot_bulk", "ops_stripe_webhook_processed"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("\n(recent price_snapshot if logged separately — checking job keys is authoritative)\n");

  const { data: pc } = await db
    .from("price_cache")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log("Latest price_cache row updated_at:", pc?.updated_at ?? "—");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
