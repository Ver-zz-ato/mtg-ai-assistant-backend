import http from "http";
import { execSync } from "child_process";

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "localhost", port: 3000, path }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

const H1_CHECK_PATHS = [
  "/tools/mulligan",
  "/blog/mana-curve-mastery",
  "/blog/why-ai-can-help-with-mtg-deck-building",
  "/blog/welcome-to-manatap-ai-soft-launch",
];

function extractH1Text(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) =>
      match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

(async () => {
  console.log("🔍 ManaTap SEO Health Check");
  console.log("============================");

  try {
    // Check robots.txt
    const r = await get("/robots.txt");
    console.log(`📋 robots.txt: ${r.status === 200 ? "✅ OK" : "❌ FAIL"} (${r.status})`);
    if (r.status === 200 && r.body) {
      const hasAdmin = r.body.includes("Disallow: /admin/");
      const hasApi = r.body.includes("Disallow: /api/");
      const hasSitemap = r.body.includes("Sitemap: https://www.manatap.ai/sitemap.xml");
      console.log(`   - Admin blocked: ${hasAdmin ? "✅" : "❌"}`);
      console.log(`   - API blocked: ${hasApi ? "✅" : "❌"}`);
      console.log(`   - Sitemap declared: ${hasSitemap ? "✅" : "❌"}`);
    }

    // Check sitemap.xml
    const s = await get("/sitemap.xml");
    console.log(`🗺️  sitemap.xml: ${s.status === 200 ? "✅ OK" : "❌ FAIL"} (${s.status})`);
    if (s.status === 200 && s.body) {
      const urlCount = (s.body.match(/<url>/g) || []).length;
      const hasManaTapDomain = s.body.includes("https://www.manatap.ai/");
      console.log(`   - URLs found: ${urlCount}`);
      console.log(`   - ManaTap domain: ${hasManaTapDomain ? "✅" : "❌"}`);
    }

    // Check homepage for JSON-LD
    const h = await get("/");
    console.log(`🏠 Homepage: ${h.status === 200 ? "✅ OK" : "❌ FAIL"} (${h.status})`);
    if (h.status === 200 && h.body) {
      const hasJsonLd = h.body.includes('application/ld+json');
      const hasCanonical = h.body.includes('rel="canonical"');
      console.log(`   - JSON-LD structured data: ${hasJsonLd ? "✅" : "❌"}`);
      console.log(`   - Canonical link: ${hasCanonical ? "✅" : "❌"}`);
    }

    if (r.status !== 200 || s.status !== 200 || h.status !== 200) {
      console.log("\n❌ Some SEO essentials are failing!");
      process.exit(1);
    }

    let h1Failures = 0;
    console.log("\nH1 uniqueness checks");
    for (const path of H1_CHECK_PATHS) {
      const page = await get(path);
      if (page.status !== 200) {
        h1Failures++;
        console.log(`   - ${path}: FAIL HTTP ${page.status}`);
        continue;
      }
      const h1s = extractH1Text(page.body);
      const ok = h1s.length === 1;
      if (!ok) h1Failures++;
      console.log(`   - ${path}: ${ok ? "OK" : "FAIL"} ${h1s.length} h1${h1s.length === 1 ? "" : "s"}${h1s[0] ? ` (${h1s[0]})` : ""}`);
    }
    if (h1Failures > 0) {
      console.log("\nOne or more pages do not have exactly one h1!");
      process.exit(1);
    }

    // Check for unintended noindex outside admin areas
    try {
      const out = execSync(`git grep -n "noindex" -- "app/**" ":!app/admin/**" ":!app/my-decks/**"`, { 
        stdio: "pipe", 
        encoding: "utf8" 
      });
      if (out.trim()) {
        console.log("\n⚠️  WARNING: Found 'noindex' outside expected private areas:");
        console.log(out);
      }
    } catch (error) {
      // No matches is fine - git grep exits with 1 when no matches found
      if (error.status !== 1) {
        console.log("⚠️  Could not check for unintended noindex (git grep failed)");
      }
    }

    console.log("\n✅ ManaTap SEO health check passed!");
    
  } catch (error) {
    console.error("❌ SEO health check failed:", error.message);
    process.exit(1);
  }
})();
