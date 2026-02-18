#!/usr/bin/env node
/**
 * Validate sitemap URLs for SEO: ensure each returns 200 or single-hop 308/301.
 * Fails if: redirect chain >1, 404, 5xx, or non-XML sitemap response.
 *
 * Usage: npx tsx scripts/seo/validate-sitemap.ts [BASE_URL]
 *   BASE_URL defaults to https://www.manatap.ai
 *
 * Env: SITEMAP_VALIDATE_SAMPLE (default 20) - URLs to sample per child sitemap
 */

const BASE = process.argv[2] || "https://www.manatap.ai";
const SAMPLE_PER_SEGMENT = parseInt(process.env.SITEMAP_VALIDATE_SAMPLE || "20", 10);

async function fetchText(url: string): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(url, { method: "GET", redirect: "manual" });
  const body = await res.text();
  const contentType = res.headers.get("content-type") || "";
  return { status: res.status, body, contentType };
}

async function headWithRedirect(
  url: string,
  maxHops = 2
): Promise<{ ok: boolean; results: Array<{ url: string; status: number }>; error?: string }> {
  const results: Array<{ url: string; status: number }> = [];
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, { method: "HEAD", redirect: "manual" });
    results.push({ url: current, status: res.status });
    if (res.status === 200) return { ok: true, results };
    if (res.status === 301 || res.status === 308) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, results, error: "Redirect without Location" };
      current = loc.startsWith("http") ? loc : new URL(loc, current).toString();
      continue;
    }
    return { ok: false, results, error: `Unexpected status ${res.status}` };
  }
  return { ok: false, results, error: "Redirect chain > 1 hop" };
}

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1].trim());
  return locs;
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = Math.floor(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr[Math.min(i * step, arr.length - 1)]);
}

function isXmlResponse(contentType: string, body: string): boolean {
  if (contentType.includes("xml")) return true;
  return body.trimStart().startsWith("<?xml") || body.trimStart().startsWith("<");
}

async function main() {
  console.log(`🔍 Sitemap validation: ${BASE}`);
  console.log(`   Sample per segment: ${SAMPLE_PER_SEGMENT}\n`);

  const indexRes = await fetchText(`${BASE}/sitemap.xml`);
  if (indexRes.status !== 200) {
    console.error(`❌ Sitemap index: ${indexRes.status}`);
    process.exit(1);
  }
  if (!isXmlResponse(indexRes.contentType, indexRes.body)) {
    console.error(`❌ Sitemap index: non-XML response`);
    process.exit(1);
  }

  const segmentUrls = extractLocs(indexRes.body);
  if (segmentUrls.length === 0) {
    console.error(`❌ No sitemap segments in index`);
    process.exit(1);
  }

  const failures: Array<{ url: string; error: string; chain?: string }> = [];
  let totalChecked = 0;

  for (const segUrl of segmentUrls) {
    const segRes = await fetchText(segUrl);
    if (segRes.status !== 200) {
      failures.push({ url: segUrl, error: `Segment ${segRes.status}` });
      continue;
    }
    if (!isXmlResponse(segRes.contentType, segRes.body)) {
      failures.push({ url: segUrl, error: "Non-XML sitemap" });
      continue;
    }

    const urls = extractLocs(segRes.body);
    const sampled = sample(urls, SAMPLE_PER_SEGMENT);
    const segName = segUrl.split("/").pop() || segUrl;

    for (const url of sampled) {
      totalChecked++;
      const result = await headWithRedirect(url);
      if (!result.ok) {
        failures.push({
          url,
          error: result.error || "Unknown",
          chain: result.results.map((r) => `${r.url} → ${r.status}`).join(" → "),
        });
      }
    }
    console.log(`   ${segName}: ${sampled.length} URLs`);
  }

  if (failures.length > 0) {
    console.log("");
    console.error("❌ FAILED:");
    failures.forEach((f) => {
      console.error(`   ${f.url}`);
      console.error(`      ${f.error}${f.chain ? ` (${f.chain})` : ""}`);
    });
    process.exit(1);
  }

  console.log(`\n✅ ${totalChecked} URLs OK across ${segmentUrls.length} segments`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
