import { isCommanderEligible } from "@/lib/deck/deck-enrichment";
import type { CollectionCardMeta } from "./useCollectionBuildMetadata";

/** Commander eligibility from cache metadata (with type_line fallback). */
export function isCommanderCandidateMeta(meta: CollectionCardMeta | undefined): boolean {
  if (!meta) return false;
  if (isCommanderEligible(meta.type_line ?? undefined, meta.oracle_text ?? undefined)) {
    return true;
  }
  const tl = String(meta.type_line || "").toLowerCase();
  if (tl.includes("legendary") && tl.includes("creature")) return true;
  if (tl.includes("legendary planeswalker") && String(meta.oracle_text || "").toLowerCase().includes("can be your commander")) {
    return true;
  }
  return false;
}
