/**
 * Re-exports from commanders.ts for backward compatibility.
 * commander-slugs is the single source of truth (lib/commanders.ts).
 */

import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";

export function toCommanderSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function commanderSlugToName(slug: string): string | null {
  const profile = getCommanderBySlug(slug);
  return profile?.name ?? null;
}

export function getAllCommanderSlugs(): string[] {
  return getFirst50CommanderSlugs();
}
