import { getCommanderSlugByName } from "@/lib/commanders";
import { MARKETING_SITE_BASE } from "./marketingPublicLinks";

export type CommanderDeepLink = {
  name: string;
  slug: string;
  url: string;
};

export function buildCommanderDeepLinks(commanderNames: string[]): CommanderDeepLink[] {
  const seen = new Set<string>();
  const links: CommanderDeepLink[] = [];

  for (const raw of commanderNames) {
    const name = raw.trim();
    if (!name) continue;
    const slug = getCommanderSlugByName(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    links.push({
      name,
      slug,
      url: `${MARKETING_SITE_BASE}/commanders/${slug}`,
    });
  }

  return links.slice(0, 8);
}

export function commanderNamesFromBriefContext(opts: {
  metaCommanders: string[];
  trendingCards?: unknown;
}): string[] {
  const names = [...opts.metaCommanders];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}
