import assert from "node:assert/strict";
import {
  chatAnalyzeFormat,
  chatFormatForLegality,
  chatFormatSupportInstruction,
  chatFormatUsesCommanderLayers,
  chatResolvedFormatUsesCommanderLayers,
  formatKeyForChatPromptLayers,
  resolveChatFormat,
} from "../../lib/chat/resolve-chat-format";

console.log("[chat-format-resolution] first-class formats");
const modern = resolveChatFormat({ prefsFormat: "Modern" });
assert.equal(modern.canonical, "modern");
assert.equal(formatKeyForChatPromptLayers(modern), "modern");
assert.equal(chatAnalyzeFormat(modern), "Modern");
assert.equal(chatFormatForLegality(modern), "Modern");
assert.equal(chatFormatUsesCommanderLayers(modern.canonical), false);
assert.equal(chatResolvedFormatUsesCommanderLayers(modern), false);

const commander = resolveChatFormat({ prefsFormat: "EDH" });
assert.equal(commander.canonical, "commander");
assert.equal(formatKeyForChatPromptLayers(commander), "commander");
assert.equal(chatAnalyzeFormat(commander), "Commander");
assert.equal(chatFormatUsesCommanderLayers(commander.canonical), true);
assert.equal(chatResolvedFormatUsesCommanderLayers(commander), true);

console.log("[chat-format-resolution] limited formats do not borrow Commander layers");
const legacy = resolveChatFormat({ prefsFormat: "Legacy" });
assert.equal(legacy.canonical, null);
assert.equal(legacy.supportEntry?.supportLevel, "limited");
assert.equal(formatKeyForChatPromptLayers(legacy), "generic");
assert.equal(chatAnalyzeFormat(legacy), null);
assert.equal(chatFormatForLegality(legacy), "Legacy");
assert.equal(chatFormatUsesCommanderLayers(legacy.canonical), false);
assert.equal(chatResolvedFormatUsesCommanderLayers(legacy), false);
assert.match(chatFormatSupportInstruction(legacy) ?? "", /limited support/i);
assert.match(chatFormatSupportInstruction(legacy) ?? "", /Do not analyze this deck as Commander/i);

const brawl = resolveChatFormat({ contextFormat: "Brawl" });
assert.equal(brawl.canonical, null);
assert.equal(brawl.supportEntry?.key, "brawl");
assert.equal(formatKeyForChatPromptLayers(brawl), "generic");
assert.equal(chatAnalyzeFormat(brawl), null);
assert.equal(chatFormatForLegality(brawl), "Brawl");

const textPauper = resolveChatFormat({ userText: "analyse this pauper deck\n4 faerie seer" });
assert.equal(textPauper.canonical, "pauper");
assert.equal(chatResolvedFormatUsesCommanderLayers(textPauper), false);

const textStandard = resolveChatFormat({ userText: "analyse this standard deck:\n4 make disappear" });
assert.equal(textStandard.canonical, "standard");
assert.equal(chatResolvedFormatUsesCommanderLayers(textStandard), false);

console.log("[chat-format-resolution] unknown explicit format stays generic, but bad prefs do not block a linked deck");
const unknownOnly = resolveChatFormat({ prefsFormat: "Whatever Casual" });
assert.equal(unknownOnly.canonical, null);
assert.equal(unknownOnly.supportEntry, null);
assert.equal(formatKeyForChatPromptLayers(unknownOnly), "generic");
assert.equal(chatAnalyzeFormat(unknownOnly), null);
assert.equal(chatFormatForLegality(unknownOnly), null);
assert.match(chatFormatSupportInstruction(unknownOnly) ?? "", /not recognized/i);

const badPrefsWithDeck = resolveChatFormat({ prefsFormat: "Whatever Casual", deckFormat: "Pioneer" });
assert.equal(badPrefsWithDeck.canonical, "pioneer");
assert.equal(formatKeyForChatPromptLayers(badPrefsWithDeck), "pioneer");
assert.equal(chatAnalyzeFormat(badPrefsWithDeck), "Pioneer");

console.log("[chat-format-resolution] no hint preserves legacy Commander-first chat default with commander gates");
const noHint = resolveChatFormat({});
assert.equal(formatKeyForChatPromptLayers(noHint), "commander");
assert.equal(chatAnalyzeFormat(noHint), "Commander");
assert.equal(chatFormatForLegality(noHint), "Commander");
assert.equal(chatFormatUsesCommanderLayers(noHint.canonical), false);
assert.equal(chatResolvedFormatUsesCommanderLayers(noHint), true);

console.log("[chat-format-resolution] OK");
