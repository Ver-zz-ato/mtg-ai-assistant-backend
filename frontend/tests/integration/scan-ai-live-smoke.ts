/**
 * Live smoke tests for deployed scanner AI endpoints.
 * Run: npx tsx tests/integration/scan-ai-live-smoke.ts
 * Env: SCAN_AI_BASE_URL (default https://www.manatap.ai)
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SCAN_AI_BASE_URL ?? "https://www.manatap.ai").replace(/\/$/, "");
const HEADERS = {
  "Content-Type": "application/json",
  "X-ManaTap-Client": "manatap_app",
  "X-Analytics-Session-Id": `scan-ai-smoke-${Date.now()}`,
};

type DisambiguateJson = {
  ok?: boolean;
  error?: string;
  code?: string;
  recognition?: {
    source?: string;
    guessed_name?: string;
    validated_name?: string;
    confidence?: string;
    confidence_score?: number;
    reason?: string;
    alternatives?: string[];
    validation_source?: string;
    assist_mode?: string;
    top_fuzzy_name_before?: string;
  };
  tier?: string;
  limit?: number;
  remaining?: number;
};

async function disambiguate(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/cards/scan-disambiguate`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      sourcePage: "app_scan_ai_disambiguate",
      usageSource: "manatap_app",
      aiTriggerReason: "ambiguous_scores",
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as DisambiguateJson;
  return { res, json };
}

async function scryfallExact(name: string): Promise<{ ok: boolean; officialName?: string }> {
  const headers = { Accept: "application/json", "User-Agent": "ManaTapScanSmoke/1.0" };
  const q = encodeURIComponent(`!"${name}"`);
  const r = await fetch(`https://api.scryfall.com/cards/search?q=${q}&unique=cards`, { headers });
  if (r.status === 404) {
    const fuzzy = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
      { headers }
    );
    if (!fuzzy.ok) return { ok: false };
    const j = (await fuzzy.json()) as { name?: string };
    return { ok: true, officialName: j.name };
  }
  const j = (await r.json()) as { data?: Array<{ name?: string }> };
  if (!Array.isArray(j.data) || !j.data.length) return { ok: false };
  return { ok: true, officialName: j.data[0].name };
}

function assertRecognition(
  json: DisambiguateJson,
  label: string,
  opts?: { expectAmongFuzzy?: string[]; minConfidence?: "low" | "medium" | "high" }
) {
  assert.equal(json.ok, true, `${label}: ok must be true`);
  const rec = json.recognition;
  assert.ok(rec, `${label}: recognition missing`);
  assert.equal(rec!.source, "ai_text", `${label}: source`);
  assert.ok(rec!.validated_name?.trim(), `${label}: validated_name empty`);
  assert.ok(rec!.guessed_name?.trim(), `${label}: guessed_name empty`);
  assert.match(rec!.confidence ?? "", /^(high|medium|low)$/, `${label}: confidence`);
  assert.ok(
    typeof rec!.confidence_score === "number" && rec!.confidence_score > 0,
    `${label}: confidence_score`
  );
  assert.ok(Array.isArray(rec!.alternatives), `${label}: alternatives array`);
  assert.ok(rec!.reason?.trim(), `${label}: reason`);
  assert.ok(rec!.validation_source?.trim(), `${label}: validation_source`);

  if (opts?.expectAmongFuzzy?.length) {
    const keys = new Set(
      opts.expectAmongFuzzy.map((n) => n.trim().toLowerCase().replace(/\s+/g, " "))
    );
    const vk = rec!.validated_name!.trim().toLowerCase().replace(/\s+/g, " ");
    assert.ok(
      keys.has(vk) || rec!.alternatives?.some((a) => keys.has(a.trim().toLowerCase().replace(/\s+/g, " "))),
      `${label}: validated "${rec!.validated_name}" not among fuzzy ${opts.expectAmongFuzzy.join(", ")}`
    );
  }

  const order = { low: 0, medium: 1, high: 2 };
  if (opts?.minConfidence) {
    assert.ok(
      order[rec!.confidence as keyof typeof order] >= order[opts.minConfidence],
      `${label}: confidence ${rec!.confidence} < ${opts.minConfidence}`
    );
  }
}

function isRateLimited(res: Response, json: DisambiguateJson): boolean {
  return res.status === 429 || json.code === "RATE_LIMIT_DAILY" || json.code === "BUDGET_LIMIT";
}

async function testDisambiguateCases() {
  console.log("\n=== POST /api/cards/scan-disambiguate ===\n");

  {
    const { res, json } = await disambiguate({});
    assert.equal(res.status, 400, "empty body status");
    assert.equal(json.ok, false);
    assert.equal(json.error, "missing_scan_context");
    console.log("✓ empty body → 400 missing_scan_context");
  }

  {
    const fuzzy = [
      { name: "Lightning Bolt", score: 0.71 },
      { name: "Lightning Strike", score: 0.69 },
      { name: "Lightning Helix", score: 0.55 },
    ];
    const { res, json } = await disambiguate({
      normalizedOcrText: "lightning b0lt",
      ocrCandidates: ["lightning b0lt", "lightning bolt"],
      fuzzyMatches: fuzzy,
    });
    if (isRateLimited(res, json)) {
      console.log("⊘ guest rate limit hit — remaining disambiguate cases skipped");
      return;
    }
    assert.equal(res.status, 200, "ambiguous status");
    assertRecognition(json, "ambiguous Lightning", { expectAmongFuzzy: fuzzy.map((f) => f.name) });
    const valid = await scryfallExact(json.recognition!.validated_name!);
    assert.ok(valid.ok, `ambiguous: "${json.recognition!.validated_name}" not on Scryfall`);
    console.log(
      `✓ ambiguous OCR → "${json.recognition!.validated_name}" (${json.recognition!.confidence}, ${json.recognition!.validation_source})`
    );
    console.log(`  tier=${json.tier} remaining=${json.remaining}/${json.limit}`);
  }

  {
    const fuzzy = [{ name: "Sheoldred, the Apocalypse", score: 0.62 }];
    const { res, json } = await disambiguate({
      normalizedOcrText: "sheoldred apocalypse",
      ocrCandidates: ["sheoldred apocalypse"],
      fuzzyMatches: fuzzy,
    });
    assert.equal(res.status, 200);
    assertRecognition(json, "single fuzzy Sheoldred");
    const valid = await scryfallExact(json.recognition!.validated_name!);
    assert.ok(valid.ok, "Sheoldred not on Scryfall");
    console.log(`✓ single strong fuzzy → "${json.recognition!.validated_name}"`);
  }

  {
    const fuzzy = [
      { name: "Rakka Mar, Steamkin Renegade", score: 0.58 },
      { name: "Ragavan, Nimble Pilferer", score: 0.52 },
    ];
    const { res, json } = await disambiguate({
      normalizedOcrText: "rakka mar",
      ocrCandidates: ["rakka mar", "rakka mar steamkin"],
      fuzzyMatches: fuzzy,
      sessionCardNames: ["Lightning Bolt"],
    });
    assert.equal(res.status, 200);
    assertRecognition(json, "Rakka Mar session", { expectAmongFuzzy: fuzzy.map((f) => f.name) });
    const valid = await scryfallExact(json.recognition!.validated_name!);
    assert.ok(valid.ok, "Rakka not on Scryfall");
    const vk = json.recognition!.validated_name!.toLowerCase();
    assert.ok(
      vk.includes("rakka") || vk.includes("ragavan"),
      `Rakka case: unexpected pick "${json.recognition!.validated_name}"`
    );
    console.log(
      `✓ Rakka-style ambiguous → "${json.recognition!.validated_name}" (scryfall: ${valid.officialName ?? "?"})`
    );
  }

  {
    const fuzzy = [
      { name: "Millicent, Restless Revenant", score: 0.61 },
      { name: "Millicent's Guidance", score: 0.48 },
    ];
    const t0 = Date.now();
    const { res, json } = await disambiguate({
      normalizedOcrText: "millicent restless",
      ocrCandidates: ["millicent restless", "millicent"],
      fuzzyMatches: fuzzy,
    });
    const ms = Date.now() - t0;
    assert.equal(res.status, 200);
    assertRecognition(json, "Millicent ambiguous", { expectAmongFuzzy: fuzzy.map((f) => f.name) });
    const valid = await scryfallExact(json.recognition!.validated_name!);
    assert.ok(valid.ok, "Millicent not on Scryfall");
    console.log(`✓ Millicent ambiguous (${ms}ms) → "${json.recognition!.validated_name}"`);
  }

  {
    const fuzzy = [
      { name: "Etali, Primal Conqueror", score: 0.54 },
      { name: "Etali, Primal Storm", score: 0.53 },
    ];
    const { res, json } = await disambiguate({
      normalizedOcrText: "etali primal",
      fuzzyMatches: fuzzy,
    });
    assert.equal(res.status, 200);
    if (json.ok) {
      assertRecognition(json, "Etali DFC pair", { expectAmongFuzzy: fuzzy.map((f) => f.name) });
      console.log(`✓ Etali ambiguous → "${json.recognition!.validated_name}"`);
    } else {
      assert.ok(json.code, "Etali failure should have code");
      console.log(`⚠ Etali ambiguous returned ok:false code=${json.code} error=${json.error}`);
    }
  }

  {
    const fuzzy = [{ name: "Counterspell", score: 0.41 }];
    const { res, json } = await disambiguate({
      normalizedOcrText: "xyznotacard",
      fuzzyMatches: fuzzy,
    });
    assert.equal(res.status, 200);
    if (json.ok) {
      assertRecognition(json, "garbage OCR + fuzzy fallback");
      assert.equal(
        json.recognition!.validated_name!.toLowerCase(),
        "counterspell",
        "should fall back to fuzzy Counterspell"
      );
      console.log(`✓ garbage OCR → fuzzy fallback "${json.recognition!.validated_name}"`);
    } else {
      console.log(`⚠ garbage OCR path: ok:false code=${json.code}`);
    }
  }
}

async function testRecognizeImage() {
  console.log("\n=== POST /api/cards/recognize-image ===\n");

  const imgPath = join(process.cwd(), "tests", "fixtures", "scan-smoke-bolt.jpg");
  let imageBytes: Buffer;
  try {
    imageBytes = readFileSync(imgPath);
  } catch {
    console.log("⊘ skip recognize-image (no tests/fixtures/scan-smoke-bolt.jpg)");
    return;
  }

  const form = new FormData();
  form.append(
    "image",
    new Blob([imageBytes], { type: "image/jpeg" }),
    "scan-smoke-bolt.jpg"
  );
  form.append("assistMode", "fallback");
  form.append("imageRole", "title");
  form.append("sourcePage", "app_scan_ai_fallback");
  form.append("usageSource", "manatap_app");
  form.append(
    "scanContext",
    JSON.stringify({
      normalizedOcrText: "lightning",
      fuzzyMatches: [
        { name: "Lightning Bolt", score: 0.5 },
        { name: "Lightning Strike", score: 0.48 },
      ],
      aiTriggerReason: "low_top_score",
    })
  );

  const res = await fetch(`${BASE}/api/cards/recognize-image`, {
    method: "POST",
    headers: {
      "X-ManaTap-Client": "manatap_app",
      "X-Analytics-Session-Id": `scan-vision-smoke-${Date.now()}`,
    },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as DisambiguateJson & {
    recognition?: { source?: string; image_role?: string; assist_mode?: string };
  };

  console.log(`status=${res.status} ok=${json.ok} error=${json.error ?? "-"} code=${json.code ?? "-"}`);
  if (json.ok && json.recognition) {
    assert.equal(json.recognition.source, "ai_vision");
    assert.ok(json.recognition.validated_name?.trim());
    const valid = await scryfallExact(json.recognition.validated_name!);
    console.log(
      `✓ vision → "${json.recognition.validated_name}" conf=${json.recognition.confidence} scryfall=${valid.officialName ?? valid.ok}`
    );
  } else if (res.status === 429) {
    console.log("⚠ vision rate limited (acceptable for smoke)");
  } else {
    console.log(`⚠ vision failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
}

async function main() {
  console.log(`Base URL: ${BASE}`);
  await testDisambiguateCases();
  await testRecognizeImage();
  console.log("\n=== All critical disambiguate checks passed ===\n");
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
