#!/usr/bin/env tsx
/**
 * Submit public sitemap URLs to IndexNow.
 *
 * Usage:
 *   npx tsx scripts/submit-indexnow-from-sitemap.ts --dry-run
 *   npx tsx scripts/submit-indexnow-from-sitemap.ts --submit --limit=500
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeIndexNowUrls, submitToIndexNow } from "@/lib/seo/indexnow";

const DEFAULT_SITEMAP = "https://www.manatap.ai/sitemap.xml";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

async function fetchXml(url: string): Promise<string> {
  // eslint-disable-next-line no-restricted-globals -- CLI script fetches public sitemap XML outside app request handling.
  const res = await fetch(url, { headers: { Accept: "application/xml,text/xml" } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  loadEnvLocal();

  const submit = process.argv.includes("--submit");
  const sitemapUrl = argValue("sitemap") || DEFAULT_SITEMAP;
  const limit = Math.max(0, Number.parseInt(argValue("limit") || "0", 10) || 0);

  const indexXml = await fetchXml(sitemapUrl);
  const locs = extractLocs(indexXml);
  const sitemapLocs = locs.filter((url) => /\/sitemap\/.+\.xml$/i.test(url));
  const pageUrls: string[] = locs.filter((url) => !/\.xml($|\?)/i.test(url));

  for (const loc of sitemapLocs) {
    try {
      const xml = await fetchXml(loc);
      pageUrls.push(...extractLocs(xml));
    } catch (e) {
      console.warn(e instanceof Error ? e.message : String(e));
    }
  }

  const normalized = normalizeIndexNowUrls(pageUrls);
  const urls = limit > 0 ? normalized.urls.slice(0, limit) : normalized.urls;

  console.log(`Sitemap: ${sitemapUrl}`);
  console.log(`Discovered: ${pageUrls.length}`);
  console.log(`Eligible: ${normalized.urls.length}`);
  console.log(`Skipped: ${normalized.skippedCount}`);
  console.log(`Mode: ${submit ? "submit" : "dry-run"}`);
  urls.slice(0, 10).forEach((url) => console.log(`  ${url}`));
  if (urls.length > 10) console.log(`  ...${urls.length - 10} more`);

  if (!submit) return;

  const result = await submitToIndexNow(urls);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
