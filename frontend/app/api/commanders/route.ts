import { NextResponse } from "next/server";
import type { CommanderProfile } from "@/lib/commanders";
import { COMMANDERS } from "@/lib/commanders";
import { renderElevatorPitch } from "@/lib/guide-api-assembler";

function tierListBadge(tier: string | undefined): string | undefined {
  if (tier === "flagship") return "Flagship";
  if (tier === "full") return "Full guide";
  if (tier === "enhanced") return "Enhanced";
  if (tier === "basic") return "Quick hub";
  return undefined;
}

function tierSortKey(t: string | undefined): number {
  const order: Record<string, number> = {
    flagship: 0,
    full: 1,
    enhanced: 2,
    standard: 3,
    basic: 4,
  };
  return order[t ?? "standard"] ?? 3;
}

function listShortPitch(c: CommanderProfile): string {
  if (c.guideTier === "flagship" && c.flagship?.loveReason?.trim()) {
    const s = c.flagship.loveReason.trim();
    return s.length > 220 ? `${s.slice(0, 217)}…` : s;
  }
  return renderElevatorPitch(c);
}

/** GET /api/commanders — List commanders with guides for mobile app. */
export async function GET() {
  const rows = COMMANDERS.filter((c) => c.hasGuide !== false).map((c) => {
    const guideTier = c.guideTier ?? "standard";
    const shortPitch = listShortPitch(c);
    const isFlagshipGuide = guideTier === "flagship";
    return {
      slug: c.slug,
      name: c.name,
      colors: c.colors,
      tags: c.tags,
      blurb: c.blurb,
      /** One-line list subtitle — flagship hooks use `loveReason` when set. */
      shortPitch,
      hasGuide: true as const,
      guideTier,
      featuredGuide: c.featuredGuide ?? false,
      isFlagshipGuide,
      /** Optional honest badge for non-default tiers (omit for standard templated hubs). */
      tierBadge: tierListBadge(guideTier),
    };
  });

  rows.sort((a, b) => {
    const td = tierSortKey(a.guideTier) - tierSortKey(b.guideTier);
    if (td !== 0) return td;
    const af = a.featuredGuide ? 1 : 0;
    const bf = b.featuredGuide ? 1 : 0;
    if (bf !== af) return bf - af;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return NextResponse.json({
    commanders: rows,
    /** Slugs of flagship-tier guides (for spotlight / hero strips; empty if none). */
    flagshipSlugs: rows.filter((r) => r.isFlagshipGuide).map((r) => r.slug),
  });
}
