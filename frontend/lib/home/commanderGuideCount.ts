import commanderProfiles from "@/lib/data/commander_profiles.json";
import { EXTRA_COMMANDER_PROFILES } from "@/lib/data/commander-extra-profiles";

const MAX_COMMANDERS = 100;

/** Client-safe commander catalog size for homepage highlights (mirrors `buildCommanders()`). */
const profileCount = Object.keys(commanderProfiles).length;
const extraCount = Object.keys(EXTRA_COMMANDER_PROFILES).filter(
  (name) => !(name in commanderProfiles),
).length;

export const HOME_COMMANDER_GUIDE_COUNT = Math.min(profileCount + extraCount, MAX_COMMANDERS);
