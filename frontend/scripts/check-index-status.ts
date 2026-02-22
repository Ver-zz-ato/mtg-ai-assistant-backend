/**
 * Commander Page Index Status Checker
 * 
 * This script:
 * 1. Generates all commander page URLs (main + subpages)
 * 2. Checks indexing status using Google Custom Search API (if configured)
 * 3. Outputs results to CSV for review
 * 
 * Usage:
 *   npx tsx scripts/check-index-status.ts
 *   npx tsx scripts/check-index-status.ts --check  (runs actual index check)
 * 
 * For Google Search Console bulk inspection, use the generated CSV.
 */

import fs from "fs";
import path from "path";

const BASE_URL = "https://www.manatap.ai";
const CONTENT_PAGES = ["best-cards", "budget-upgrades", "mulligan-guide"] as const;

// Commander data (from lib/commanders.ts)
const COMMANDERS = [
  "the-ur-dragon",
  "edgar-markov",
  "atraxa-praetors-voice",
  "krenko-mob-boss",
  "kaalia-of-the-vast",
  "pantlaza-sun-favored",
  "sauron-the-dark-lord",
  "yuriko-the-tigers-shadow",
  "lathril-blade-of-the-elves",
  "kenrith-the-returned-king",
  "giada-font-of-hope",
  "jodah-the-unifier",
  "miirym-sentinel-wyrm",
  "the-wise-mothman",
  "nekusar-the-mindrazer",
  "y-shtola-nights-blessed",
  "isshin-two-heavens-as-one",
  "hakbal-of-the-surging-soul",
  "ulalek-fused-atrocity",
  "ms-bumbleflower",
  "muldrotha-the-gravetide",
  "meren-of-clan-nel-toth",
  "teysa-karlov",
  "breya-etherium-shaper",
  "rhys-the-redeemed",
  "sythis-harvests-hand",
  "osgir-the-reconstructor",
  "esix-fractal-bloom",
  "wilhelt-the-rotcleaver",
  "korvold-fae-cursed-king",
  "chulane-teller-of-tales",
  "krenko-tin-street-kingpin",
  "etali-primal-storm",
  "xyris-the-writhing-storm",
  "tivit-seller-of-secrets",
  "prossh-skyraider-of-kher",
  "aesi-tyrant-of-gyre-strait",
  "brago-king-eternal",
  "teferi-temporal-archmage",
  "derevi-empyrial-tactician",
  "gishath-suns-avatar",
  "maelstrom-wanderer",
  "sliver-overlord",
  "the-first-sliver",
  "narset-enlightened-master",
  "xenagos-god-of-revels",
  "omnath-locus-of-creation",
  "omnath-locus-of-rage",
  "aragorn-the-unifier",
  "rocco-cabaretti-caterer",
  "myra-the-magnificent",
];

interface PageInfo {
  url: string;
  type: "main" | "best-cards" | "budget-upgrades" | "mulligan-guide";
  commander: string;
  inGSC?: boolean;
  impressions?: number;
  clicks?: number;
  position?: number;
}

function generateAllUrls(): PageInfo[] {
  const pages: PageInfo[] = [];
  
  for (const slug of COMMANDERS) {
    // Main commander page
    pages.push({
      url: `${BASE_URL}/commanders/${slug}`,
      type: "main",
      commander: slug,
    });
    
    // Subpages
    for (const subpage of CONTENT_PAGES) {
      pages.push({
        url: `${BASE_URL}/commanders/${slug}/${subpage}`,
        type: subpage,
        commander: slug,
      });
    }
  }
  
  return pages;
}

function loadGSCData(): Map<string, { impressions: number; clicks: number; position: number }> {
  const gscMap = new Map<string, { impressions: number; clicks: number; position: number }>();
  
  const gscPath = path.join(__dirname, "gsc-data", "Pages.csv");
  if (!fs.existsSync(gscPath)) {
    console.log("⚠️  No GSC data found at scripts/gsc-data/Pages.csv");
    return gscMap;
  }
  
  const content = fs.readFileSync(gscPath, "utf-8");
  const lines = content.split("\n").slice(1); // Skip header
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const [url, clicks, impressions, ctr, position] = line.split(",");
    if (url) {
      gscMap.set(url.trim(), {
        impressions: parseInt(impressions) || 0,
        clicks: parseInt(clicks) || 0,
        position: parseFloat(position) || 0,
      });
    }
  }
  
  return gscMap;
}

async function checkIndexedViaGoogle(url: string): Promise<boolean> {
  // Simple check using site: query
  // Note: This is rate-limited and may not be 100% accurate
  try {
    const searchUrl = `https://www.google.com/search?q=site:${encodeURIComponent(url)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const html = await response.text();
    // If Google shows results, the page is likely indexed
    return !html.includes("did not match any documents") && html.includes(url.replace("https://", ""));
  } catch {
    return false;
  }
}

function generateReport(pages: PageInfo[], gscData: Map<string, { impressions: number; clicks: number; position: number }>): string {
  const lines: string[] = [];
  
  // CSV header
  lines.push("URL,Type,Commander,In GSC,Impressions,Clicks,Position,Priority Action");
  
  for (const page of pages) {
    const gsc = gscData.get(page.url);
    const inGSC = gsc ? "Yes" : "No";
    const impressions = gsc?.impressions ?? 0;
    const clicks = gsc?.clicks ?? 0;
    const position = gsc?.position ?? 0;
    
    // Determine priority action
    let action = "";
    if (!gsc) {
      action = "Request Indexing";
    } else if (impressions > 0 && clicks === 0) {
      action = "Improve CTR (title/meta)";
    } else if (position > 20) {
      action = "Improve Content/Links";
    } else if (impressions > 10 && position < 10) {
      action = "Monitor - Good";
    }
    
    lines.push(`${page.url},${page.type},${page.commander},${inGSC},${impressions},${clicks},${position.toFixed(1)},"${action}"`);
  }
  
  return lines.join("\n");
}

function generateSummary(pages: PageInfo[], gscData: Map<string, { impressions: number; clicks: number; position: number }>): string {
  const indexed = pages.filter(p => gscData.has(p.url));
  const notIndexed = pages.filter(p => !gscData.has(p.url));
  
  const byType = {
    main: { indexed: 0, notIndexed: 0 },
    "best-cards": { indexed: 0, notIndexed: 0 },
    "budget-upgrades": { indexed: 0, notIndexed: 0 },
    "mulligan-guide": { indexed: 0, notIndexed: 0 },
  };
  
  for (const p of indexed) {
    byType[p.type].indexed++;
  }
  for (const p of notIndexed) {
    byType[p.type].notIndexed++;
  }
  
  // Find top performers
  const topPerformers = indexed
    .map(p => ({ ...p, ...gscData.get(p.url)! }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);
  
  // Find high-priority for indexing (not in GSC but likely valuable)
  const highPriority = notIndexed.filter(p => 
    p.type === "best-cards" || p.type === "budget-upgrades"
  ).slice(0, 20);
  
  return `
═══════════════════════════════════════════════════════════════════
              COMMANDER PAGE INDEX STATUS REPORT
═══════════════════════════════════════════════════════════════════

SUMMARY
───────────────────────────────────────────────────────────────────
Total Commander Pages: ${pages.length}
  ├─ Appearing in GSC: ${indexed.length} (${((indexed.length/pages.length)*100).toFixed(1)}%)
  └─ Not in GSC:       ${notIndexed.length} (${((notIndexed.length/pages.length)*100).toFixed(1)}%)

BY PAGE TYPE
───────────────────────────────────────────────────────────────────
  Main Pages:       ${byType.main.indexed} indexed / ${byType.main.notIndexed} not indexed
  Best Cards:       ${byType["best-cards"].indexed} indexed / ${byType["best-cards"].notIndexed} not indexed
  Budget Upgrades:  ${byType["budget-upgrades"].indexed} indexed / ${byType["budget-upgrades"].notIndexed} not indexed
  Mulligan Guides:  ${byType["mulligan-guide"].indexed} indexed / ${byType["mulligan-guide"].notIndexed} not indexed

TOP 10 PERFORMING PAGES (by impressions)
───────────────────────────────────────────────────────────────────
${topPerformers.map((p, i) => 
  `  ${i+1}. ${p.url.replace(BASE_URL, '')}\n     ${p.impressions} impressions, ${p.clicks} clicks, position ${p.position?.toFixed(1)}`
).join("\n")}

HIGH-PRIORITY FOR INDEXING (request in GSC)
───────────────────────────────────────────────────────────────────
${highPriority.slice(0, 15).map((p, i) => 
  `  ${i+1}. ${p.url}`
).join("\n")}

NEXT STEPS
───────────────────────────────────────────────────────────────────
1. Go to Google Search Console: https://search.google.com/search-console
2. Use URL Inspection tool for each high-priority URL
3. Click "Request Indexing" for pages not yet indexed
4. For pages with impressions but 0 clicks, improve title/meta description
5. Add internal links from homepage to key commander pages

Full details exported to: scripts/seo/index-status-report.csv
`;
}

function generateGSCBulkList(pages: PageInfo[], gscData: Map<string, { impressions: number; clicks: number; position: number }>): string {
  // Generate a plain list of URLs not in GSC for easy copy-paste into GSC
  const notIndexed = pages.filter(p => !gscData.has(p.url));
  return notIndexed.map(p => p.url).join("\n");
}

async function main() {
  console.log("🔍 Commander Page Index Status Checker\n");
  
  // Generate all URLs
  const pages = generateAllUrls();
  console.log(`📋 Generated ${pages.length} commander page URLs`);
  console.log(`   (${COMMANDERS.length} commanders × 4 page types)\n`);
  
  // Load GSC data
  const gscData = loadGSCData();
  console.log(`📊 Loaded ${gscData.size} pages from GSC data\n`);
  
  // Generate reports
  const csvReport = generateReport(pages, gscData);
  const summary = generateSummary(pages, gscData);
  const bulkList = generateGSCBulkList(pages, gscData);
  
  // Ensure output directory exists
  const outputDir = path.join(__dirname, "seo");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write files
  fs.writeFileSync(path.join(outputDir, "index-status-report.csv"), csvReport);
  fs.writeFileSync(path.join(outputDir, "index-status-summary.txt"), summary);
  fs.writeFileSync(path.join(outputDir, "urls-to-index.txt"), bulkList);
  
  // Print summary
  console.log(summary);
  
  console.log("\n📁 Files generated:");
  console.log("   • scripts/seo/index-status-report.csv - Full report with all pages");
  console.log("   • scripts/seo/index-status-summary.txt - This summary");
  console.log("   • scripts/seo/urls-to-index.txt - URLs to request indexing for");
  
  // Check if --check flag is passed for live index checking
  if (process.argv.includes("--check")) {
    console.log("\n⏳ Running live index checks (this may take a while)...\n");
    
    const notIndexed = pages.filter(p => !gscData.has(p.url)).slice(0, 10);
    for (const page of notIndexed) {
      const indexed = await checkIndexedViaGoogle(page.url);
      console.log(`   ${indexed ? "✅" : "❌"} ${page.url.replace(BASE_URL, "")}`);
      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

main().catch(console.error);
