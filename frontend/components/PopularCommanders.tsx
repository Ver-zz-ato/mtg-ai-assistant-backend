import { CommanderLinkWithHover } from "@/components/CommanderLinkWithHover";
import {
  getExternalMostPlayedCommanders,
  getExternalTrendingCommanders,
} from "@/lib/meta/externalDailyMeta";
import { formatMetaUpdatedPhrase } from "@/lib/meta/freshness";
import { pillClassAt } from "@/lib/ui/accentPills";

type PopularCommandersProps = {
  variant?: "link" | "pill";
  limit?: number;
};

export async function PopularCommanders({ variant = "pill", limit = 10 }: PopularCommandersProps) {
  const played = await getExternalMostPlayedCommanders(limit + 4).catch(() => ({
    items: [],
    updatedAt: null,
    snapshotDate: null,
  }));

  const seen = new Set<string>();
  const popular = played.items.filter((commander) => {
    if (seen.has(commander.slug)) return false;
    seen.add(commander.slug);
    return true;
  });

  if (popular.length < Math.min(6, limit)) {
    const trending = await getExternalTrendingCommanders(limit + 4).catch(() => ({
      items: [],
      updatedAt: null,
      snapshotDate: null,
    }));
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
      <ul className="flex flex-wrap gap-2">
        {commanders.map((c, i) => (
          <li key={c.slug}>
            <CommanderLinkWithHover
              href={`/commanders/${c.slug}`}
              name={c.name}
              pillClass={variant === "pill" ? pillClassAt(i) : undefined}
              className={variant === "link" ? "text-sm" : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
