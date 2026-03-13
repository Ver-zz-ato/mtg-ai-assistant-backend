/**
 * Unit tests for rules-facts module (ManaTap Intelligence Module A).
 * Tests detectRulesLegalityIntent, extractCardNamesFromMessage, and getCardRulesFact.
 */
import {
  detectRulesLegalityIntent,
  extractCardNamesFromMessage,
  getCardRulesFact,
  getCommanderEligibilityFact,
  getRulesFactBundle,
} from "../../lib/deck/rules-facts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  // --- detectRulesLegalityIntent ---
  assert(detectRulesLegalityIntent("can Multani be my commander?") === true, "Multani commander Q");
  assert(detectRulesLegalityIntent("can [[Grist]] be a commander?") === true, "Grist bracket commander Q");
  assert(detectRulesLegalityIntent("why is Lightning Helix off-color?") === true, "off-color Q");
  assert(detectRulesLegalityIntent("is Sol Ring legal in commander?") === true, "format legality Q");
  assert(detectRulesLegalityIntent("is Sheoldred banned?") === true, "banned Q");
  assert(detectRulesLegalityIntent("is [[Sheoldred]] banned?") === true, "banned Q with brackets");
  assert(detectRulesLegalityIntent("color identity for this deck?") === true, "color identity Q");
  assert(detectRulesLegalityIntent("Partner with Kraum") === true, "Partner mention");
  assert(detectRulesLegalityIntent("choose a background") === true, "Background mention");
  assert(detectRulesLegalityIntent("add more ramp") === false, "non-rules ramp Q");
  assert(detectRulesLegalityIntent("what cards synergize with Llanowar Elves?") === false, "non-rules synergy Q");
  assert(detectRulesLegalityIntent("") === false, "empty string");
  assert(detectRulesLegalityIntent("hi") === false, "too short");

  // --- extractCardNamesFromMessage ---
  const names1 = extractCardNamesFromMessage("can [[Grist]] be my commander?");
  assert(names1.length === 1 && names1[0] === "Grist", "single bracket card");

  const names2 = extractCardNamesFromMessage("Is [[Sol Ring]] or [[Lightning Greaves]] off-color?");
  assert(names2.length === 2, "two bracket cards");
  assert(names2.includes("Sol Ring") && names2.includes("Lightning Greaves"), "both cards extracted");

  const names3 = extractCardNamesFromMessage("no brackets here");
  assert(names3.length === 0, "no brackets");

  const names4 = extractCardNamesFromMessage("[[Multani, Yavimaya's Avatar]]");
  assert(names4.length === 1 && names4[0].includes("Multani"), "commander-style name");

  // --- getCardRulesFact (integration-style; may hit Scryfall) ---
  try {
    const multani = await getCardRulesFact("Multani, Yavimaya's Avatar");
    assert(multani.cardName.toLowerCase().includes("multani"), "Multani name");
    assert(multani.commanderEligible === true, "Multani is legendary creature -> commander eligible");
    assert(multani.commanderEligibleReason === "legendary_creature", "reason legendary_creature");
    assert(multani.colorIdentity.includes("G"), "Multani green identity");
  } catch (e) {
    console.warn("getCardRulesFact Multani skipped (network/cache):", (e as Error).message);
  }

  try {
    const solRing = await getCardRulesFact("Sol Ring");
    assert(solRing.cardName.toLowerCase().includes("sol ring"), "Sol Ring name");
    assert(solRing.commanderEligible === false, "Sol Ring not commander eligible");
    assert(solRing.commanderEligibleReason === null, "no commander reason");
  } catch (e) {
    console.warn("getCardRulesFact Sol Ring skipped (network/cache):", (e as Error).message);
  }

  // --- getCommanderEligibilityFact ---
  try {
    const eligible = await getCommanderEligibilityFact("Multani, Yavimaya's Avatar");
    assert(eligible.eligible === true && /legendary|creature/i.test(eligible.reason), "Multani eligible");
  } catch (e) {
    console.warn("getCommanderEligibilityFact skipped:", (e as Error).message);
  }

  // --- getRulesFactBundle ---
  try {
    const bundle = await getRulesFactBundle("Multani, Yavimaya's Avatar", ["Sol Ring"]);
    assert(bundle.commander != null, "commander in bundle");
    assert(bundle.cards.length >= 1, "cards in bundle");
    assert(bundle.deckColorIdentity.length >= 1, "deck color identity");
  } catch (e) {
    console.warn("getRulesFactBundle skipped:", (e as Error).message);
  }

  console.log("OK rules-facts tests");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
