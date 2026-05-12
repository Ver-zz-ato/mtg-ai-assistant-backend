import assert from "node:assert/strict";
import {
  buildDirectFormatQuestionAnswer,
  encodeChatMetadata,
  looksLikePastedDecklist,
  persistAssistantMessage,
  runChatToolPlanner,
  stripChatMetadata,
} from "../../lib/chat/orchestrator";
import { parseDeckChangeIntent } from "../../lib/chat/deck-actions";
import { extractCommanderFromDecklistText, isDecklist } from "../../lib/chat/decklistDetector";
import { parseDeckText } from "../../lib/deck/parseDeckText";
import { isDeckAnalysisRequest } from "../../lib/ai/layer0-gate";

async function main() {
  const metadata = {
    threadId: "thread-1",
    assistantMessageId: "msg-1",
    persisted: true,
    toolResults: [{ kind: "card_lookup" as const, ok: true, title: "Card lookup", summary: "ok" }],
    pendingDeckAction: null,
  };
  const encoded = `hello${encodeChatMetadata(metadata)}[DONE]`;
  const stripped = stripChatMetadata(encoded.replace("[DONE]", ""));
  assert.equal(stripped.text, "hello");
  assert.deepEqual(stripped.metadata, metadata);

  const inserts: unknown[] = [];
  const fakeSupabase = {
    from(table: string) {
      assert.equal(table, "chat_messages");
      return {
        insert(payload: unknown) {
          inserts.push(payload);
          return {
            select() {
              return {
                maybeSingle: async () => ({ data: { id: "assistant-1" }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const saved = await persistAssistantMessage(fakeSupabase, {
    threadId: "thread-1",
    content: "answer",
    metadata,
  });
  assert.deepEqual(saved, { id: "assistant-1", persisted: true });
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0], {
    thread_id: "thread-1",
    role: "assistant",
    content: "answer",
    metadata,
  });

  assert.deepEqual(parseDeckChangeIntent("add 2 Lightning Bolt to the deck"), [
    { type: "add", name: "Lightning Bolt", qty: 2, zone: "mainboard" },
  ]);
  assert.deepEqual(parseDeckChangeIntent("remove Sol Ring from sideboard"), [
    { type: "remove", name: "Sol Ring", qty: 1, zone: "sideboard" },
  ]);
  assert.deepEqual(parseDeckChangeIntent("swap Counterspell for Swan Song"), [
    { type: "swap", remove: "Counterspell", add: "Swan Song", qty: 1, zone: "mainboard" },
  ]);

  assert.match(
    buildDirectFormatQuestionAnswer({ text: "This is Brawl, not Commander — what's wrong with it?" }) ?? "",
    /Brawl.*60-card/i
  );
  assert.match(
    buildDirectFormatQuestionAnswer({ text: "This is Historic on Arena — do I have too many 1-ofs?" }) ?? "",
    /Historic.*Arena/i
  );
  assert.match(
    buildDirectFormatQuestionAnswer({ text: "I want this to be Modern but I have Mana Crypt." }) ?? "",
    /Mana Crypt.*not legal in Modern/i
  );
  assert.match(
    buildDirectFormatQuestionAnswer({ text: "Here's my 100-card deck with Atraxa at the helm - tell me what's missing." }) ?? "",
    /Commander deck.*100 cards/i
  );

  const pastedList = `analyse this:
1 Maralen, Fae Ascendant
1 Alela, Cunning Conqueror
1 Alchemist's Refuge
1 Arcane Denial
1 Arcane Signet
1 Arbor Elf
1 Beast Within
1 Bitterblossom
1 Bloom Tender
1 Command Tower
1 Counterspell
1 Cyclonic Rift
1 Rhystic Study
1 Sol Ring
1 Umbral Mantle`;

  assert.equal(looksLikePastedDecklist(pastedList), true);
  assert.equal(isDeckAnalysisRequest(pastedList), true);
  assert.equal(
    buildDirectFormatQuestionAnswer({ text: pastedList, format: "Commander" }),
    null,
    "pasted decklists must not trigger Sol Ring legality shortcut"
  );
  const planned = await runChatToolPlanner({
    origin: "https://www.manatap.ai",
    text: pastedList,
    format: "Commander",
  });
  assert.equal(
    planned.some((r) => r.kind === "card_lookup" || r.kind === "legality_check"),
    false,
    "pasted decklists must not be treated as single-card lookup/legality prompts"
  );

  const compressedMuldrotha = `Analyze this Commander deck and tell me what it's missing. Commander Muldrotha, the Gravetide 🧩 Creatures (27) Sakura-Tribe Elder Llanowar Elves Elvish Mystic Satyr Wayfinder Stitcher’s Supplier Coiling Oracle Eternal Witness Baleful Strix Plaguecrafter Fleshbag Marauder Merciless Executioner Ravenous Chupacabra Acidic Slime Solemn Simulacrum Tireless Provisioner Sidisi, Undead Vizier Mulldrifter Nyx Weaver World Shaper Ramunap Excavator Gravebreaker Lamia Sheoldred, Whispering One Bane of Progress Consecrated Sphinx Avenger of Zendikar Spore Frog Kokusho, the Evening Star 🔮 Artifacts (7) Sol Ring Arcane Signet Commander's Sphere Wayfarer’s Bauble Skullclamp Nihil Spellbomb Ashnod’s Altar 🌿 Enchantments (10) Pernicious Deed Seal of Primordium Seal of Doom Animate Dead Necromancy Mystic Remora Sylvan Library Song of the Dryads Deadbridge Chant Imprisoned in the Moon ⚡ Instants (6) Counterspell Arcane Denial Beast Within Putrefy Heroic Intervention Reality Shift 📜 Sorceries (8) Cultivate Kodama’s Reach Buried Alive Victimize Living Death Toxic Deluge Windfall Final Parting 🌍 Lands (41) Command Tower Zagoth Triome Opulent Palace Breeding Pool Watery Grave Overgrown Tomb Woodland Cemetery Drowned Catacomb Hinterland Harbor Yavimaya Coast Llanowar Wastes Underground River Bojuka Bog Field of the Dead Strip Mine Myriad Landscape Fabled Passage Terramorphic Expanse Evolving Wilds 7 Forest 5 Island 5 Swamp`;
  assert.equal(isDecklist(compressedMuldrotha), true);
  assert.equal(looksLikePastedDecklist(compressedMuldrotha), true);
  assert.equal(extractCommanderFromDecklistText(compressedMuldrotha), "Muldrotha, the Gravetide");
  assert.ok(parseDeckText(compressedMuldrotha).length >= 50, "compressed section export should produce usable deck context");
  const compressedPlanned = await runChatToolPlanner({
    origin: "https://www.manatap.ai",
    text: compressedMuldrotha,
    format: "Commander",
  });
  assert.equal(
    compressedPlanned.some((r) => r.kind === "card_lookup" || r.kind === "legality_check"),
    false,
    "compressed deck exports must not be treated as single-card lookup/legality prompts"
  );

  const pauperList = `analyse this pauper deck
4 faerie seer
4 spellstutter sprite
4 ninja of the deep hours
2 moon-circuit hacker
4 faerie miscreant
4 counterspell
3 spell pierce
3 snap
3 preordain
2 brainstorm
3 of one mind
3 mutagenic growth
16 island
2 ash barrens
3 hydroblast
3 blue elemental blast
2 relic of progenitus
2 gut shot
2 dispel
3 echoing truth`;
  assert.equal(isDecklist(pauperList), true);
  assert.equal(isDeckAnalysisRequest(pauperList), true);
  assert.equal(looksLikePastedDecklist(pauperList), true);

  const standardList = `analyse this standard deck:
4 make disappear
4 dissipate
3 sunfall
2 farewell
4 memory deluge
3 deduce
3 the wandering emperor
2 teferi, who slows the sunset
4 deserted beach
4 adarkar wastes
4 seachrome coast
6 island
6 plains
3 disdainful stroke
2 negate
2 temporary lockdown
2 knockout blow
3 sunset revelry
3 unlicensed hearse`;
  assert.equal(isDecklist(standardList), true);
  assert.equal(isDeckAnalysisRequest(standardList), true);
  assert.equal(looksLikePastedDecklist(standardList), true);

  console.log("chat-orchestrator.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
