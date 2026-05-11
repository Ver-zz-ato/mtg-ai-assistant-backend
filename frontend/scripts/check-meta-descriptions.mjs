import http from "http";

const PORT = Number(process.env.PORT || 3000);
const MIN_DESCRIPTION_LENGTH = Number(process.env.MIN_META_DESCRIPTION_LENGTH || 90);

const PUBLIC_PATHS = [
  "/",
  "/tools",
  "/tools/mulligan",
  "/tools/probability",
  "/deck/swap-suggestions",
  "/collections/cost-to-finish",
  "/price-tracker",
  "/compare-decks",
  "/blog",
  "/blog/mana-curve-mastery",
  "/blog/why-ai-can-help-with-mtg-deck-building",
  "/blog/welcome-to-manatap-ai-soft-launch",
  "/meta",
  "/meta/trending-commanders",
  "/meta/most-played-commanders",
  "/meta/budget-commanders",
  "/meta/trending-cards",
  "/meta/most-played-cards",
  "/cards",
  "/cards/talisman-of-progress",
  "/cards/blasphemous-act",
  "/commanders",
  "/commander-archetypes",
  "/decks/browse",
];

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "localhost", port: PORT, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      })
      .on("error", reject);
  });
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractDescription(html) {
  const match = html.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  if (match) return decodeEntities(match[1]).trim();

  const reversed = html.match(/<meta\s+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return reversed ? decodeEntities(reversed[1]).trim() : "";
}

let failures = 0;

for (const path of PUBLIC_PATHS) {
  const { status, body } = await get(path);
  if (status !== 200) {
    failures++;
    console.log(`FAIL ${path}: HTTP ${status}`);
    continue;
  }

  const description = extractDescription(body);
  if (!description) {
    failures++;
    console.log(`FAIL ${path}: missing meta description`);
    continue;
  }

  if (description.length < MIN_DESCRIPTION_LENGTH) {
    failures++;
    console.log(`FAIL ${path}: ${description.length} chars - ${description}`);
    continue;
  }

  console.log(`OK   ${path}: ${description.length} chars`);
}

if (failures > 0) {
  console.log(`\n${failures} meta description issue${failures === 1 ? "" : "s"} found.`);
  process.exit(1);
}

console.log("\nMeta description check passed.");
