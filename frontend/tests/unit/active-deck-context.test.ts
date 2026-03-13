/**
 * Unit tests for ActiveDeckContext resolver.
 * Run: npx tsx tests/unit/active-deck-context.test.ts
 */
import assert from "node:assert";
import { resolveActiveDeckContext, isAuthoritativeCommander } from "@/lib/chat/active-deck-context";

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

// --- confirm → follow-up without re-ask (thread has confirmed commander)
const confirmedFollowUp = resolveActiveDeckContext(
  base({
    tid: "t1",
    text: "suggest ramp upgrades",
    thread: { deck_id: null, commander: "Azusa, Lost but Seeking", decklist_text: MINI_DECK, decklist_hash: "abc" },
  })
);
assert.strictEqual(confirmedFollowUp.commanderStatus, "confirmed");
assert.strictEqual(isAuthoritativeCommander(confirmedFollowUp), true);
assert.strictEqual(confirmedFollowUp.shouldAskCommanderConfirmation, false);

// --- correction persists
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
