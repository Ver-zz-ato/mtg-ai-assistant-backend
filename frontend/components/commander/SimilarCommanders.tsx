/**
 * Similar commanders based on shared tags/strategies.
 * Deterministic, no AI, no extra DB.
 */

import Link from "next/link";
import { COMMANDERS, getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import type { CommanderProfile } from "@/lib/commanders";
import { getGlobalMetaCommanders } from "@/lib/meta/global-meta-entities";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tagOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map((t) => norm(t)));
  return a.filter((t) => setB.has(norm(t))).length;
}

async function getSimilarCommanders(currentSlug: string, limit = 6): Promise<CommanderProfile[]> {
  const current = getCommanderBySlug(currentSlug);
  if (!current) return getFirst50CommanderSlugs().slice(0, limit).map((s) => getCommanderBySlug(s)!).filter(Boolean);

  const currentTags = current.tags ?? [];
  const metaRows = await getGlobalMetaCommanders(100).catch(() => []);
  const metaScore = new Map(
    metaRows.map((row) => [
      row.slug,
      (row.trendingRank ? 80 - row.trendingRank : 0) +
        (row.mostPlayedRank ? 60 - row.mostPlayedRank : 0),
    ])
  );
  const scored = COMMANDERS.filter((c) => c.slug !== currentSlug).map((c) => ({
    profile: c,
    overlap: tagOverlap(currentTags, c.tags ?? []),
    score: tagOverlap(currentTags, c.tags ?? []) * 1000 + (metaScore.get(c.slug) ?? 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  const withOverlap = scored.filter((s) => s.overlap > 0).map((s) => s.profile);
  const rest = scored.filter((s) => s.overlap === 0).map((s) => s.profile);
  const result = [...withOverlap, ...rest].slice(0, limit);

  if (result.length < limit) {
    const slugs = getFirst50CommanderSlugs();
    const used = new Set([currentSlug, ...result.map((r) => r.slug)]);
    for (const slug of slugs) {
      if (result.length >= limit) break;
      if (used.has(slug)) continue;
      const p = getCommanderBySlug(slug);
      if (p) {
        result.push(p);
        used.add(slug);
      }
    }
  }

  return result;
}

type Props = {
  currentSlug: string;
};

export async function SimilarCommanders({ currentSlug }: Props) {
  const similar = await getSimilarCommanders(currentSlug);
  if (similar.length === 0) return null;

  return (
    <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/25 via-neutral-950/60 to-neutral-900/50 p-5 mb-6">
      <h2 className="text-lg font-semibold text-violet-100 mb-4">
        Similar commanders in the meta
      </h2>
      <div className="overflow-x-auto -mx-1 pb-2">
        <ul className="flex gap-2 min-w-0">
          {similar.map((c) => (
            <li key={c.slug} className="shrink-0">
              <Link
                href={`/commanders/${c.slug}`}
                className="inline-block px-4 py-2 rounded-lg bg-violet-950/35 hover:bg-violet-900/45 text-cyan-200 hover:text-cyan-100 text-sm font-medium transition-colors border border-violet-400/25 hover:border-cyan-300/40"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
