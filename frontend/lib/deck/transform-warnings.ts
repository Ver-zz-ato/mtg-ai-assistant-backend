/**
 * Deterministic warnings for POST /api/deck/transform (best-effort; never blocks success).
 */

import { parseDeckText } from "@/lib/deck/parseDeckText";
import { norm, getCommanderColorIdentity } from "@/lib/deck/generation-helpers";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";

/**
 * If commander is known, count source lines that appear outside that commander's color identity.
 */
export async function warnSourceOffColor(
  sourceDeckText: string,
  commanderName: string | null
): Promise<string | undefined> {
  if (!commanderName?.trim()) return undefined;
  const allowed = await getCommanderColorIdentity(commanderName);
  if (allowed.length === 0) return undefined;

  const entries = parseDeckText(sourceDeckText);
  if (entries.length === 0) return undefined;

  const names = [...new Set(entries.map((e) => e.name))];
  const details = await getDetailsForNamesCached(names);
  const allowedU = allowed.map((c) => c.toUpperCase());

  let offLines = 0;
  for (const e of entries) {
    const card = details.get(norm(e.name));
    if (card && !isWithinColorIdentity(card as SfCard, allowedU)) {
      offLines += 1;
    }
  }

  if (offLines === 0) return undefined;
  return `Source deck lists ${offLines} line(s) that appear outside ${commanderName}'s color identity (replacements may be needed).`;
}
