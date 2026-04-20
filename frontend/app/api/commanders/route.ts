import { NextResponse } from "next/server";
import { COMMANDERS } from "@/lib/commanders";

/** GET /api/commanders — List commanders with guides for mobile app. */
export async function GET() {
  const commanders = COMMANDERS.filter((c) => c.hasGuide !== false).map((c) => ({
    slug: c.slug,
    name: c.name,
    colors: c.colors,
    tags: c.tags,
    blurb: c.blurb,
    hasGuide: true as const,
    guideTier: c.guideTier ?? "standard",
    featuredGuide: c.featuredGuide ?? false,
  }));
  return NextResponse.json({ commanders });
}
