import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { normalizeScryfallCacheName, scryfallCacheLookupNameKeys } from "@/lib/server/scryfallCacheRow";
import { getServiceRoleClient } from "@/lib/server-supabase";
import { tagCard } from "@/lib/deck/card-role-tags";

export type GroundedCardExplainPacket = {
  name: string;
  displayName: string;
  oracleText: string;
  typeLine: string;
  manaCost: string;
  setCode: string;
  collectorNumber: string;
  roleTags: string[];
  likelyRole: string;
  likelyUseCases: string[];
  commonPitfalls: string[];
  timingProfile: string;
};

function firstTag(tags: string[]): string {
  return tags[0] || "support piece";
}

async function loadCardCacheDetails(name: string): Promise<Record<string, unknown>> {
  const admin = getServiceRoleClient();
  const lookupKeys = scryfallCacheLookupNameKeys(name);
  const targetKey = normalizeScryfallCacheName(name);

  if (admin && lookupKeys.length) {
    const { data } = await admin
      .from("scryfall_cache")
      .select(
        "name, oracle_text, type_line, mana_cost, color_identity, legalities, colors, keywords, is_land, is_creature, cmc, printed_name"
      )
      .in("name", lookupKeys)
      .limit(4);

    if (Array.isArray(data) && data.length) {
      const exact =
        data.find((row) => normalizeScryfallCacheName(String((row as { name?: string }).name || "")) === targetKey) ||
        data[0];
      if (exact) return exact as Record<string, unknown>;
    }
  }

  const cached = await getDetailsForNamesCached([name]).catch(() => new Map<string, any>());
  return (
    cached.get(targetKey) ||
    cached.get(name.toLowerCase()) ||
    cached.get(name) ||
    [...cached.values()][0] ||
    {}
  );
}

export async function buildGroundedCardExplainPacket(input: {
  name: string;
  displayName?: string;
  oracleText?: string;
  typeLine?: string;
  manaCost?: string;
  setCode?: string;
  collectorNumber?: string;
}): Promise<GroundedCardExplainPacket> {
  const details = await loadCardCacheDetails(input.name);
  const oracleText = String(details?.oracle_text || input.oracleText || "").trim();
  const typeLine = String(details?.type_line || input.typeLine || "").trim();
  const manaCost = String((details as { mana_cost?: string })?.mana_cost || input.manaCost || "").trim();
  const colorIdentity = Array.isArray(details?.color_identity) ? details.color_identity : [];
  const tagged = tagCard({
    name: input.name,
    qty: 1,
    oracle_text: oracleText,
    type_line: typeLine,
    mana_cost: manaCost,
    color_identity: colorIdentity,
    legalities: (details as { legalities?: Record<string, string> })?.legalities || {},
    colors: Array.isArray((details as { colors?: string[] }).colors) ? (details as { colors?: string[] }).colors : [],
    keywords: Array.isArray((details as { keywords?: string[] }).keywords) ? (details as { keywords?: string[] }).keywords : [],
    is_land: typeof (details as { is_land?: boolean }).is_land === "boolean" ? (details as { is_land?: boolean }).is_land : undefined,
    is_creature: typeof (details as { is_creature?: boolean }).is_creature === "boolean" ? (details as { is_creature?: boolean }).is_creature : undefined,
    cmc: typeof (details as { cmc?: number }).cmc === "number" ? (details as { cmc?: number }).cmc : undefined,
  });
  const roleTags = tagged.tags.map((entry) => entry.tag);
  const likelyRole = firstTag(roleTags).replace(/_/g, " ");
  const likelyUseCases = [
    roleTags.includes("ramp") || roleTags.includes("land_ramp") ? "smooths your mana and helps you deploy bigger plays sooner" : "",
    roleTags.includes("draw") || roleTags.includes("repeatable_draw") ? "keeps cards flowing so you do not run out of gas" : "",
    roleTags.includes("spot_removal") || roleTags.includes("counterspell") ? "answers key threats at the right time" : "",
    roleTags.includes("finisher") ? "helps convert a stable board into a way to close the game" : "",
    roleTags.includes("token_producer") ? "adds bodies that fuel go-wide or sacrifice plans" : "",
  ].filter(Boolean);
  const commonPitfalls = [
    roleTags.includes("ramp") ? "it is strongest early; drawing it very late can matter less" : "",
    roleTags.includes("spot_removal") ? "holding it too long can waste tempo if the threat window passes" : "",
    roleTags.includes("board_wipe") ? "firing it off too early can strand your own development" : "",
    roleTags.includes("finisher") ? "it can look clunky if the rest of the deck does not support reaching that point" : "",
  ].filter(Boolean);
  const timingProfile = roleTags.includes("counterspell")
    ? "wants mana up and rewards patience"
    : roleTags.includes("spot_removal")
      ? "best when you answer the highest-leverage threat, not just the first one"
      : roleTags.includes("ramp")
        ? "usually strongest in the first few turns"
        : roleTags.includes("finisher")
          ? "best saved for the turn it can meaningfully swing or end the game"
          : "timing depends on board state and what role the card is filling";

  return {
    name: input.name,
    displayName: input.displayName || input.name,
    oracleText,
    typeLine,
    manaCost,
    setCode: input.setCode || "",
    collectorNumber: input.collectorNumber || "",
    roleTags,
    likelyRole,
    likelyUseCases,
    commonPitfalls,
    timingProfile,
  };
}
