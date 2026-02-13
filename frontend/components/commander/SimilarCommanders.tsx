/**
 * Similar commanders based on shared tags/strategies.
 * Deterministic, no AI, no extra DB.
 */

import Link from "next/link";
import { COMMANDERS, getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import type { CommanderProfile } from "@/lib/commanders";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tagOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map((t) => norm(t)));
  return a.filter((t) => setB.has(norm(t))).length;
}

function getSimilarCommanders(currentSlug: string, limit = 6): CommanderProfile[] {
  const current = getCommanderBySlug(currentSlug);
  if (!current) return getFirst50CommanderSlugs().slice(0, limit).map((s) => getCommanderBySlug(s)!).filter(Boolean);

  const currentTags = current.tags ?? [];
  const scored = COMMANDERS.filter((c) => c.slug !== currentSlug).map((c) => ({
    profile: c,
    score: tagOverlap(currentTags, c.tags ?? []),
  }));

  scored.sort((a, b) => b.score - a.score);
  const withOverlap = scored.filter((s) => s.score > 0).map((s) => s.profile);
  const rest = scored.filter((s) => s.score === 0).map((s) => s.profile);
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

export function SimilarCommanders({ currentSlug }: Props) {
  const similar = getSimilarCommanders(currentSlug);
  if (similar.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-3">Similar commanders you may like</h2>
      <ul className="flex flex-wrap gap-2">
        {similar.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/commanders/${c.slug}`}
              className="inline-block px-3 py-1.5 rounded-lg bg-neutral-700/80 hover:bg-neutral-600 text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
