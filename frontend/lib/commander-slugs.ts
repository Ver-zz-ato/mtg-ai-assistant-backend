import commanderProfiles from "@/lib/data/commander_profiles.json";

/** Convert commander name to URL-safe slug */
export function toCommanderSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Map slug -> commander name (from commander_profiles) */
const SLUG_TO_NAME: Record<string, string> = {};
for (const name of Object.keys(commanderProfiles as Record<string, unknown>)) {
  SLUG_TO_NAME[toCommanderSlug(name)] = name;
}

export function commanderSlugToName(slug: string): string | null {
  return SLUG_TO_NAME[slug] ?? null;
}

export function getAllCommanderSlugs(): string[] {
  return Object.keys(SLUG_TO_NAME);
}
