import { NextResponse } from "next/server";
import { COMMANDERS } from "@/lib/commanders";
import { renderElevatorPitch } from "@/lib/guide-api-assembler";

function tierListBadge(tier: string | undefined): string | undefined {
  if (tier === "full") return "Full guide";
  if (tier === "basic") return "Quick hub";
  return undefined;
}

/** GET /api/commanders — List commanders with guides for mobile app. */
export async function GET() {
  const rows = COMMANDERS.filter((c) => c.hasGuide !== false).map((c) => {
    const guideTier = c.guideTier ?? "standard";
    const shortPitch = renderElevatorPitch(c);
    return {
      slug: c.slug,
      name: c.name,
      colors: c.colors,
      tags: c.tags,
      blurb: c.blurb,
      /** One-line list subtitle — prefer over raw blurb in compact rows when present. */
      shortPitch,
      hasGuide: true as const,
      guideTier,
      featuredGuide: c.featuredGuide ?? false,
      /** Optional honest badge for non-default tiers (omit for standard templated hubs). */
      tierBadge: tierListBadge(guideTier),
    };
  });

  rows.sort((a, b) => {
    const af = a.featuredGuide ? 1 : 0;
    const bf = b.featuredGuide ? 1 : 0;
    if (bf !== af) return bf - af;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return NextResponse.json({ commanders: rows });
}
