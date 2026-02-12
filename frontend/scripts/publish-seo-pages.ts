#!/usr/bin/env tsx
/**
 * Generate drafts from seo_queries, then publish top N (direct Supabase, no auth).
 *
 * Usage: npx tsx scripts/publish-seo-pages.ts [limit]
 * Default limit: 25
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Prerequisite: seo_queries populated (run ingest-gsc-queries.ts with GSC export first)
 */

import * as fs from "fs";
import * as path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

async function main() {
  const limit = parseInt(process.argv[2] || "25", 10) || 25;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error("Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Step 1: Generate drafts from seo_queries (if any)
  const { generateSeoPages } = await import("@/lib/seo/generate-pages");
  const { generated } = await generateSeoPages(admin, 500);
  if (generated > 0) {
    console.log(`Generated ${generated} draft candidates.`);
  }

  // Step 2: Publish top N drafts
  const { data: draftRows, error: selErr } = await admin
    .from("seo_pages")
    .select("slug, title, quality_score")
    .eq("status", "draft")
    .gte("quality_score", 1)
    .order("priority", { ascending: false })
    .limit(limit);

  if (selErr) {
    console.error("Select failed:", selErr.message);
    process.exit(1);
  }

  if (!draftRows?.length) {
    console.log("No draft pages to publish. Run ingest-gsc-queries.ts with a GSC export first.");
    process.exit(0);
  }

  const slugs = draftRows.map((r) => r.slug);
  const { error: updErr } = await admin
    .from("seo_pages")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .in("slug", slugs);

  if (updErr) {
    console.error("Update failed:", updErr.message);
    process.exit(1);
  }

  console.log(`Published ${slugs.length} pages (noindex by default):`);
  draftRows.forEach((r) => console.log(`  /q/${r.slug} (quality: ${r.quality_score})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
