/**
 * Unit tests for ActiveDeckContext resolver.
 * Run: npx tsx tests/unit/active-deck-context.test.ts
 */
import assert from "node:assert";
import { resolveActiveDeckContext, isAuthoritativeCommander, isAuthoritativeForPrompt } from "@/lib/chat/active-deck-context";

const base = (overrides: Partial<Parameters<typeof resolveActiveDeckContext>[0]> = {}) => ({
  tid: null,
  isGuest: false,
  userId: null,
  text: null,
  context: null,
  prefs: null,
  thread: null,
  streamThreadHistory: [],
  clientConversation: [],
  deckData: null,
  ...overrides,
});

const MINI_DECK = `1 Sol Ring
1 Command Tower
1 Arcane Signet
1 Azusa, Lost but Seeking
1 Cultivate
1 Kodama's Reach
1 Acidic Slime
1 Reclamation Sage
1 Eternal Witness
1 Wood Elves`;

const DECK_WITH_COMMANDER_SECTION = `Commander
1 Muldrotha, the Gravetide

Deck
1 Sol Ring
1 Command Tower
${MINI_DECK.split("\n").slice(2).join("\n")}`;

// --- paste → infer → ask confirm
const pasteNoThread = resolveActiveDeckContext(
  base({ text: MINI_DECK, isGuest: false })
);
assert.strictEqual(pasteNoThread.hasDeck, true);
assert.ok(["current_paste", "guest_ephemeral", "none"].includes(pasteNoThread.source));
assert.ok(pasteNoThread.commanderStatus === "inferred" || pasteNoThread.commanderStatus === "missing");
assert.ok(pasteNoThread.askReason === "confirm_inference" || pasteNoThread.askReason === "need_commander" || pasteNoThread.askReason === null);

// --- linked deck precedence
const linkedVsPaste = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: MINI_DECK,
    thread: { deck_id: "d1", commander: null, decklist_text: null, decklist_hash: null },
    deckData: {
      d: { commander: "Korvold", format: "Commander" },
      entries: [{ name: "Korvold", count: 1 }],
      deckText: "1 Korvold\n1 Sol Ring",
    },
  })
);
assert.strictEqual(linkedVsPaste.source, "linked");
assert.strictEqual(linkedVsPaste.commanderName, "Korvold");
assert.strictEqual(linkedVsPaste.linkedDeckTakesPriority, true);

// --- explicit override: paste beats linked
const overridePaste = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: `use this instead\n\n${DECK_WITH_COMMANDER_SECTION}`,
    thread: { deck_id: "d1", commander: null, decklist_text: null, decklist_hash: null },
    deckData: {
      d: { commander: "Korvold" },
      entries: [],
      deckText: "1 Korvold",
    },
  })
);
assert.strictEqual(overridePaste.source, "current_paste");
assert.ok(overridePaste.commanderName === "Muldrotha, the Gravetide" || overridePaste.commanderName !== "Korvold");

// --- confirm → follow-up without re-ask (thread has confirmed commander from prior persist)
const confirmedFollowUp = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: "suggest ramp upgrades",
    thread: { deck_id: null, commander: "Azusa, Lost but Seeking", decklist_text: MINI_DECK, decklist_hash: "abc" },
  })
);
assert.strictEqual(confirmedFollowUp.commanderStatus, "confirmed");
assert.strictEqual(isAuthoritativeCommander(confirmedFollowUp), true);
assert.strictEqual(isAuthoritativeForPrompt(confirmedFollowUp), true);
assert.strictEqual(confirmedFollowUp.shouldAskCommanderConfirmation, false);
assert.strictEqual(confirmedFollowUp.askReason, null, "must NOT re-ask for commander after confirm");

// --- infer → confirm → persist (user says "yes" after AI asked; should treat as authoritative this turn)
const inferThenConfirm = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: "yes",
    thread: { deck_id: null, commander: null, decklist_text: DECK_WITH_COMMANDER_SECTION, decklist_hash: "abc" },
    streamThreadHistory: [
      { role: "user", content: DECK_WITH_COMMANDER_SECTION },
      { role: "assistant", content: "I believe your commander is [[Muldrotha, the Gravetide]]. Is this correct?" },
    ],
  })
);
assert.strictEqual(inferThenConfirm.userJustConfirmedCommander, true);
assert.strictEqual(inferThenConfirm.commanderName, "Muldrotha, the Gravetide");
assert.strictEqual(inferThenConfirm.commanderStatus, "inferred"); // not yet persisted; persist happens in stream route
assert.strictEqual(isAuthoritativeForPrompt(inferThenConfirm), true, "should treat as authoritative for prompt when user just confirmed");

// --- infer → correct → persist (user says "no, it's X"; should treat as authoritative and persist corrected)
const corrected = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: "no, it's Titania",
    thread: { deck_id: null, commander: "Azusa", decklist_text: MINI_DECK, decklist_hash: "abc" },
    streamThreadHistory: [
      { role: "user", content: MINI_DECK },
      { role: "assistant", content: "I believe your commander is [[Azusa, Lost but Seeking]]. Is this correct?" },
    ],
  })
);
assert.strictEqual(corrected.userJustCorrectedCommander, true);
assert.strictEqual(corrected.commanderName, "Titania");
assert.strictEqual(corrected.commanderStatus, "corrected");
assert.strictEqual(isAuthoritativeForPrompt(corrected), true, "should treat as authoritative when user corrected");

// --- deckReplacedByHashChange when paste has different hash
const hashChange = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: `1 New Commander
1 Sol Ring
1 Command Tower
1 Arcane Signet
1 Cultivate
1 Kodama's Reach
1 Acidic Slime
1 Reclamation Sage
1 Eternal Witness
1 Wood Elves`,
    thread: { deck_id: null, commander: "Azusa", decklist_text: MINI_DECK, decklist_hash: "old_hash_123" },
  })
);
assert.strictEqual(hashChange.source, "current_paste");
assert.strictEqual(hashChange.deckReplacedByHashChange, true);
assert.notStrictEqual(hashChange.commanderName, "Azusa", "old thread commander must NOT survive deck replacement");

// --- deck replacement with strong inferred commander (e.g. Atraxa)
const ATRAXA_DECK = `Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring
1 Command Tower
1 Arcane Signet
1 Cultivate
1 Farseek
1 Rampant Growth
1 Kodama's Reach
1 Skyshroud Claim
91 Forest`;
const hashChangeAtraxa = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: ATRAXA_DECK,
    thread: {
      deck_id: null,
      commander: "Multani, Yavimaya's Avatar",
      decklist_text: DECK_WITH_COMMANDER_SECTION,
      decklist_hash: "multani_hash",
    },
  })
);
assert.strictEqual(hashChangeAtraxa.deckReplacedByHashChange, true);
assert.strictEqual(hashChangeAtraxa.commanderName, "Atraxa, Praetors' Voice");
assert.notStrictEqual(hashChangeAtraxa.commanderName, "Multani, Yavimaya's Avatar");

// --- standalone rules question: no need_deck
const rulesOnly = resolveActiveDeckContext(
  base({ text: "Can [[Multani, Yavimaya's Avatar]] be a commander?", isStandaloneRulesQuestion: true })
);
assert.strictEqual(rulesOnly.hasDeck, false);
assert.strictEqual(rulesOnly.askReason, null);
assert.strictEqual(rulesOnly.shouldAskForDeck, false);

// --- deck-needed question with no deck: need_deck
const deckNeeded = resolveActiveDeckContext(
  base({ text: "Explain the ramp mix in my deck.", isStandaloneRulesQuestion: false })
);
assert.strictEqual(deckNeeded.hasDeck, false);
assert.strictEqual(deckNeeded.askReason, "need_deck");

// --- guest flow
const guestPaste = resolveActiveDeckContext(
  base({
    isGuest: true,
    text: "yes",
    clientConversation: [
      { role: "user", content: MINI_DECK },
      { role: "assistant", content: "I believe your commander is [[Azusa, Lost but Seeking]]. Is this correct?" },
    ],
  })
);
assert.strictEqual(guestPaste.source, "guest_ephemeral");
assert.strictEqual(guestPaste.hasDeck, true);

// --- no deck
const noDeck = resolveActiveDeckContext(base({ text: "what is trample?" }));
assert.strictEqual(noDeck.hasDeck, false);
assert.strictEqual(noDeck.source, "none");
assert.strictEqual(noDeck.askReason, "need_deck");

console.log("active-deck-context.test.ts: all tests passed");
