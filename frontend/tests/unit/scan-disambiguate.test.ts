/**
 * Scan disambiguate route contract tests.
 * Run: npx tsx tests/unit/scan-disambiguate.test.ts
 */
import assert from "node:assert";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/cards/scan-disambiguate/route";
import { buildScanDisambiguatePrompt } from "@/lib/scanner/scan-disambiguate-prompt";
import {
  normScannerName,
  parseScanAiJsonResponse,
  preferFuzzyCandidateForValidatedName,
  snapParsedPrimaryToFuzzyCandidates,
} from "@/lib/scanner/scan-ai-core";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";

async function postJson(body: unknown) {
  const req = new NextRequest("http://localhost/api/cards/scan-disambiguate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req);
}

async function main() {
  {
    const res = await postJson({});
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.ok, false);
    assert.equal(json.error, "missing_scan_context");
  }

  {
    const prompt = buildScanDisambiguatePrompt({
      normalizedOcrText: "lightning bolt",
      fuzzyMatches: [
        { name: "Lightning Bolt", score: 0.72 },
        { name: "Lightning Strike", score: 0.68 },
      ],
      aiTriggerReason: "ambiguous_scores",
    });
    assert.ok(prompt.includes("Lightning Bolt"));
    assert.ok(prompt.includes("do NOT see the card image"));
  }

  {
    const parsed = parseScanAiJsonResponse(
      '{"name":"Lightning Bolt","confidence":"high","reason":"ocr match"}'
    );
    assert.ok(parsed);
    assert.equal(parsed!.primary, "Lightning Bolt");
  }

  {
    assert.equal(normScannerName("Spider\u2011Man 2099"), "spider-man 2099");
  }

  {
    const preferred = preferFuzzyCandidateForValidatedName(
      "spiderman 2099",
      "Spiderman 2099",
      [
        { name: "Spider-Man 2099", score: 0.58 },
        { name: "Spider-Man 2099, Miguel O'Hara", score: 0.52 },
      ]
    );
    assert.equal(preferred, "Spider-Man 2099");
  }

  {
    const preferred = preferFuzzyCandidateForValidatedName(
      "rakka mar",
      "Rakka Mar",
      [
        { name: "Rakka Mar, Steamkin Renegade", score: 0.58 },
        { name: "Ragavan, Nimble Pilferer", score: 0.52 },
      ]
    );
    assert.equal(preferred, "Rakka Mar, Steamkin Renegade");
  }

  {
    const snapped = snapParsedPrimaryToFuzzyCandidates(
      {
        primary: "Lightning B0lt",
        alternatives: [],
        confidence: "medium",
        reason: "ocr typo",
      },
      [
        { name: "Lightning Bolt", score: 0.72 },
        { name: "Lightning Strike", score: 0.68 },
      ]
    );
    assert.equal(snapped.primary, "Lightning Bolt");
  }

  console.log("scan-disambiguate.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
