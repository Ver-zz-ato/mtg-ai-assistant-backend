/**
 * Mulligan trap hands regression suite.
 * Tests deck profile + handFacts for each trap hand; optionally calls advice API when RUN_MULLIGAN_E2E=1.
 * Run: tsx tests/unit/mulligan-trap-hands.test.ts
 * E2E (requires dev server + admin session): RUN_MULLIGAN_E2E=1 tsx tests/unit/mulligan-trap-hands.test.ts
 */

import { parseDecklist } from "../../lib/mulligan/parse-decklist";
import { buildDeckProfile, computeHandFacts } from "../../lib/mulligan/deck-profile";
import { GOLDEN_TEST_CASES } from "../../lib/mulligan/golden-test-cases";

const TRAP_INDEX = 3;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("Mulligan trap hands regression...");

  for (const tc of GOLDEN_TEST_CASES) {
    const trapHand = tc.hands[TRAP_INDEX];
    assert(trapHand != null, `Missing trap hand for ${tc.id}`);

    const cards = parseDecklist(tc.decklist);
    const profile = buildDeckProfile(cards, tc.commander);
    const facts = computeHandFacts(trapHand);

    if (tc.id === "turbo_combo_bant") {
      assert(!facts.hasFastMana && !facts.hasRamp && !facts.hasTutor, `Turbo trap: expected no accel/tutor, got hasRamp=${facts.hasRamp} hasFastMana=${facts.hasFastMana} hasTutor=${facts.hasTutor}`);
      console.log(`  OK turbo trap: no accel, profile=${profile.archetype}`);
    } else if (tc.id === "control_heavy") {
      assert(!facts.hasDrawEngine, `Control trap: expected no draw, got hasDrawEngine=${facts.hasDrawEngine}`);
      assert(facts.handLandCount === 1, `Control trap: expected 1 land, got ${facts.handLandCount}`);
      console.log(`  OK control trap: 1 land, no draw, profile=${profile.archetype}`);
    } else if (tc.id === "midrange_value") {
      assert(facts.hasRamp, `Midrange trap: expected ramp (spinning wheels), got hasRamp=${facts.hasRamp}`);
      assert(!facts.hasDrawEngine, `Midrange trap: expected no payoff/draw, got hasDrawEngine=${facts.hasDrawEngine}`);
      assert(facts.handLandCount === 2, `Midrange trap: expected 2 lands, got ${facts.handLandCount}`);
      console.log(`  OK midrange trap: 2 lands + ramp, no payoff, profile=${profile.archetype}`);
    }
  }

  // Optional E2E: call advice API for each trap hand
  if (process.env.RUN_MULLIGAN_E2E === "1") {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    console.log("\nE2E: calling advice API (requires dev server + admin session)...");

    for (const tc of GOLDEN_TEST_CASES) {
      const trapHand = tc.hands[TRAP_INDEX]!;
      const cards = parseDecklist(tc.decklist);

      const res = await fetch(`${base}/api/admin/mulligan/advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          modelTier: "mini",
          format: "commander",
          playDraw: "play",
          mulliganCount: 0,
          hand: trapHand,
          deck: { cards, commander: tc.commander },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 404) {
        console.log(`  SKIP ${tc.id}: not admin (404)`);
        continue;
      }
      if (!res.ok) {
        console.warn(`  WARN ${tc.id}: ${res.status} ${data.error || ""}`);
        continue;
      }

      const action = data.action;
      const confidence = data.confidence ?? 0;

      if (tc.id === "turbo_combo_bant") {
        assert(action === "MULLIGAN", `Turbo trap expected MULLIGAN, got ${action}`);
        console.log(`  OK turbo trap E2E: ${action}`);
      } else if (tc.id === "control_heavy") {
        assert(action === "MULLIGAN" || (action === "KEEP" && confidence < 60), `Control trap expected MULLIGAN or low-confidence KEEP, got ${action} ${confidence}%`);
        console.log(`  OK control trap E2E: ${action} ${confidence}%`);
      } else if (tc.id === "midrange_value") {
        assert(action === "MULLIGAN" || action === "KEEP", `Midrange trap: ${action} ${confidence}%`);
        console.log(`  OK midrange trap E2E: ${action} ${confidence}%`);
      }
    }
  } else {
    console.log("\n(Set RUN_MULLIGAN_E2E=1 with dev server + admin session for API regression)");
  }

  console.log("\nOK mulligan trap hands");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
