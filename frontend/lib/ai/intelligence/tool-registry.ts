import type { ChatToolResult } from "@/lib/chat/orchestrator";
import type { DeckIntelligencePacket } from "./packet";
import { isAiIntelligenceFlagEnabled } from "./flags";

export function buildIntelligenceToolResults(packet: DeckIntelligencePacket | null): ChatToolResult[] {
  if (!packet || !isAiIntelligenceFlagEnabled("AI_TOOL_REGISTRY_V2")) return [];
  const results: ChatToolResult[] = [];

  if (packet.spine) {
    results.push({
      kind: "deck_spine",
      ok: true,
      title: "Deck spine",
      summary: `${packet.spine.mustKeep.length} must-keep card(s), ${packet.spine.important.length} important card(s), ${packet.spine.dangerousCuts.length} dangerous cut warning(s).`,
      data: {
        mustKeep: packet.spine.mustKeep.slice(0, packet.capabilities.maxProtectedCards),
        important: packet.spine.important.slice(0, packet.capabilities.maxProtectedCards),
        dangerousCuts: packet.spine.dangerousCuts.slice(0, packet.capabilities.maxProtectedCards),
      },
    });
    results.push({
      kind: "combo_detection",
      ok: true,
      title: "Combo detection",
      summary: `${packet.spine.combosPresent.length} complete combo(s), ${packet.spine.combosMissing.length} near-miss combo(s).`,
      data: {
        present: packet.spine.combosPresent.slice(0, packet.capabilities.maxCombos),
        missing: packet.spine.combosMissing.slice(0, packet.capabilities.maxCombos),
      },
    });
  }

  if (packet.collectionFit && packet.collectionFit.mode !== "none") {
    results.push({
      kind: "collection_fit",
      ok: true,
      title: "Collection fit",
      summary: `Collection fit mode ${packet.collectionFit.mode}: ${packet.collectionFit.ownedCount} owned, ${packet.collectionFit.missingCount} missing.`,
      data: packet.collectionFit,
    });
  }

  if (packet.powerProfile) {
    results.push({
      kind: "probability_mulligan",
      ok: true,
      title: "Power profile",
      summary: `Inferred Commander bracket: ${packet.powerProfile.commanderBracket}.`,
      data: packet.powerProfile,
    });
  }

  return results;
}
