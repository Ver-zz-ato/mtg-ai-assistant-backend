/**
 * Explicit route for /sitemap.xml (sitemap index).
 * Next.js generateSitemaps only creates /sitemap/[id].xml segments, not the index.
 * This route ensures /sitemap.xml returns 200 with valid XML on all hostnames.
 */
import { NextResponse } from 'next/server';

const BASE = 'https://www.manatap.ai';
const SEGMENT_IDS = [
  'static',
  'tools',
  'commanders',
  'commander-content',
  'decks-recent',
  'archetypes',
  'strategies',
  'meta',
  'cards',
  'seo-pages',
];

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const now = new Date().toISOString();
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SEGMENT_IDS.map(
  (id) => `  <sitemap>
    <loc>${BASE}/sitemap/${id}.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`
).join('\n')}
</sitemapindex>`;

  return new NextResponse(sitemapIndex, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
