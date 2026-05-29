const BASE = "https://www.manatap.ai";
const H: Record<string, string> = {
  "Content-Type": "application/json",
  "X-ManaTap-Client": "manatap_app",
  "X-Analytics-Session-Id": `live-quick-${Date.now()}`,
};

async function disambiguate(label: string, body: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/cards/scan-disambiguate`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      sourcePage: "app_scan_ai_disambiguate",
      usageSource: "manatap_app",
      aiTriggerReason: "ambiguous_scores",
      ...body,
    }),
  });
  const json = await res.json();
  console.log(`\n--- ${label} ---`);
  console.log(`status=${res.status} ${Date.now() - t0}ms`);
  console.log(JSON.stringify(json, null, 2));
}

async function main() {
await disambiguate("Rakka fuzzy preference", {
  normalizedOcrText: "rakka mar",
  ocrCandidates: ["rakka mar"],
  fuzzyMatches: [
    { name: "Rakka Mar, Steamkin Renegade", score: 0.58 },
    { name: "Ragavan, Nimble Pilferer", score: 0.52 },
  ],
});

await disambiguate("Lightning ambiguous", {
  normalizedOcrText: "lightning b0lt",
  ocrCandidates: ["lightning b0lt"],
  fuzzyMatches: [
    { name: "Lightning Bolt", score: 0.71 },
    { name: "Lightning Strike", score: 0.69 },
  ],
});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
