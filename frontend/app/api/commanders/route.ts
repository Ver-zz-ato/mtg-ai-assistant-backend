import { NextResponse } from "next/server";
import { COMMANDERS } from "@/lib/commanders";

/** GET /api/commanders — List commanders with guides for mobile app. */
export async function GET() {
  const commanders = COMMANDERS.map((c) => ({
    slug: c.slug,
    name: c.name,
    colors: c.colors,
    tags: c.tags,
    blurb: c.blurb,
  }));
  return NextResponse.json({ commanders });
}
