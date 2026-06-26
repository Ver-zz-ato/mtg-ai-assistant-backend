import { CommanderLinkWithHover } from "@/components/CommanderLinkWithHover";
import { PopularCommandersRotator } from "@/components/PopularCommandersRotator";
import { getCommanderBySlug } from "@/lib/commanders";
import {
  getExternalMostPlayedCommanders,
  getExternalTrendingCommanders,
} from "@/lib/meta/externalDailyMeta";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { formatMetaUpdatedPhrase } from "@/lib/meta/freshness";
import { pillClassAt } from "@/lib/ui/accentPills";

type PopularCommandersProps = {
  variant?: "link" | "grid" | "rotator";
  limit?: number;
};

function commanderNorm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function PopularCommanders({
  variant = "rotator",
  limit = 10,
}: PopularCommandersProps) {
  const played = await getExternalMostPlayedCommanders(limit + 4).catch(() => ({
    items: [],
    imageMap: new Map<string, string>(),
    updatedAt: null,
    snapshotDate: null,
  }));

  const seen = new Set<string>();
  const popular = played.items.filter((commander) => {
    if (seen.has(commander.slug)) return false;
    seen.add(commander.slug);
    return true;
  });

  const imageMap = new Map(played.imageMap);

  if (popular.length < Math.min(6, limit)) {
    const trending = await getExternalTrendingCommanders(limit + 4).catch(() => ({
      items: [],
      imageMap: new Map<string, string>(),
      updatedAt: null,
      snapshotDate: null,
    }));
    for (const [key, value] of trending.imageMap) {
      if (!imageMap.has(key)) imageMap.set(key, value);
    }
    for (const commander of trending.items) {
      if (seen.has(commander.slug)) continue;
      seen.add(commander.slug);
      popular.push(commander);
      if (popular.length >= limit) break;
    }
  }

  const commanders = popular.slice(0, limit);
  if (commanders.length === 0) return null;

  const freshness = played.updatedAt
    ? formatMetaUpdatedPhrase(played.updatedAt)
    : played.snapshotDate ?? null;

  const previewMap = await getImagesForNamesCached(commanders.map((commander) => commander.name)).catch(
    () => new Map<string, { art_crop?: string; normal?: string; small?: string }>(),
  );

  const rotatorItems = commanders.map((commander) => {
    const guideProfile = getCommanderBySlug(commander.slug);
    const cachedImage = previewMap.get(commanderNorm(commander.name));
    const artUrl = imageMap.get(commanderNorm(commander.name)) ?? cachedImage?.art_crop ?? cachedImage?.small ?? null;
    return {
      name: commander.name,
      slug: commander.slug,
      artUrl,
      previewUrl: cachedImage?.normal ?? cachedImage?.art_crop ?? artUrl,
      hasGuide: Boolean(guideProfile && guideProfile.hasGuide !== false),
    };
  });

  return (
    <section
      className="mt-6 pt-5 border-t border-neutral-800"
      aria-label="Popular Commanders"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-1">
        Popular Commanders
      </h2>
      <p className="text-neutral-500 text-xs mb-3 leading-relaxed">
        Global EDHREC popularity signals
        {freshness ? (
          <>
            {" "}
            · <span className="text-neutral-400">updated {freshness}</span>
          </>
        ) : null}
      </p>
      {variant === "rotator" ? (
        <PopularCommandersRotator commanders={rotatorItems} />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {commanders.map((c, i) => (
            <li key={c.slug}>
              <CommanderLinkWithHover
                href={`/commanders/${c.slug}`}
                name={c.name}
                pillClass={variant === "grid" ? pillClassAt(i) : undefined}
                className={variant === "link" ? "text-sm" : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
