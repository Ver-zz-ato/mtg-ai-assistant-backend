/**
 * Client-safe commander eligibility helpers (no server / next/headers imports).
 * Mirrors Manatap-APP/src/lib/commanderEligibility.ts — keep aligned.
 */

/** Widens `scryfall_cache` PostgREST queries before JS filtering with `isCommanderEligible`. */
export function postgrestCommanderEligibleCatalogOr(): string {
  return [
    "type_line.ilike.%Legendary Creature%",
    "and(type_line.ilike.%Legendary Planeswalker%,oracle_text.ilike.%can be your commander%)",
    "oracle_text.ilike.%can be your commander%",
    "oracle_text.ilike.%choose a background%",
    "oracle_text.ilike.%friends forever%",
    "oracle_text.ilike.%partner%",
    "oracle_text.ilike.%doctor%companion%",
  ].join(",");
}

/** Checks commander eligibility per MTG rules. */
export function isCommanderEligible(
  typeLine: string | undefined,
  oracleText: string | undefined,
): boolean {
  if (!typeLine) return false;
  const tl = typeLine.toLowerCase();
  const ot = (oracleText || "").toLowerCase();
  if (tl.includes("legendary creature")) return true;
  if (tl.includes("legendary planeswalker") && ot.includes("can be your commander")) return true;
  if (ot.includes("can be your commander")) return true;
  if (ot.includes("choose a background")) return true;
  if (ot.includes("partner with") || ot.includes("partner")) return true;
  if (ot.includes("friends forever")) return true;
  if (ot.includes("doctor's companion")) return true;
  return false;
}
