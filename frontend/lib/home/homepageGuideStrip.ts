import commanderProfiles from "@/lib/data/commander_profiles.json";
import { EXTRA_COMMANDER_PROFILES } from "@/lib/data/commander-extra-profiles";
import { FLAGSHIP_COMMANDER_GUIDES } from "@/lib/home/commanderGuides";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const flagshipNames = new Set(FLAGSHIP_COMMANDER_GUIDES.map((g) => g.name));

const catalogNames = [
  ...Object.keys(commanderProfiles),
  ...Object.keys(EXTRA_COMMANDER_PROFILES).filter((name) => !(name in commanderProfiles)),
];

/** Enough cards to fill wide homepage rows (flagship first, then catalog order). */
const HOMEPAGE_STRIP_SIZE = 12;

export type HomepageGuideStripEntry = {
  slug: string;
  name: string;
  colors: string;
};

export const HOMEPAGE_COMMANDER_GUIDE_STRIP: HomepageGuideStripEntry[] = [
  ...FLAGSHIP_COMMANDER_GUIDES.map(({ slug, name, colors }) => ({ slug, name, colors })),
  ...catalogNames
    .filter((name) => !flagshipNames.has(name))
    .slice(0, Math.max(0, HOMEPAGE_STRIP_SIZE - FLAGSHIP_COMMANDER_GUIDES.length))
    .map((name) => ({
      slug: toSlug(name),
      name,
      colors: "",
    })),
];
