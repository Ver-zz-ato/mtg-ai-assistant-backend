/**
 * Returns priority URLs for manual GSC "Request indexing" after major deploys.
 * Protected: admin auth OR X-Admin-Token / X-Cron-Secret header.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getFirst50CommanderSlugs } from "@/lib/commanders";
import { getPublishedSeoPagesForSitemap } from "@/lib/seo-pages";

const BASE = "https://www.manatap.ai";

/** Blog slugs, latest first (curated; used when no DB) */
const BLOG_SLUGS_LATEST = [
  "how-manatap-ai-works",
  "devlog-23-days-soft-launch",
  "welcome-to-manatap-ai-soft-launch",
  "budget-commander-100",
  "mana-curve-mastery",
  "budget-edh-hidden-gems",
  "how-to-build-your-first-commander-deck",
  "the-7-most-common-deckbuilding-mistakes",
  "edh-land-count-what-the-community-actually-runs",
  "top-budget-staples-every-mtg-player-should-know-2025",
  "bug-fixes-and-improvements-january-2025",
  "why-ai-can-help-with-mtg-deck-building",
];

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token =
    req.headers.get("x-admin-token") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-cron-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  const expected =
    process.env.ADMIN_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.CRON_KEY ||
    process.env.RENDER_CRON_SECRET ||
    "";
  if (expected && token && token === expected) return true;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && isAdmin(user));
}

export async function GET(req: NextRequest) {
  try {
    const authorized = await isAuthorized(req);
    if (!authorized) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const limit = Math.min(
      Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "100", 10)),
      200
    );
    const format = req.nextUrl.searchParams.get("format") || "json";

    const staticPaths = [
      "",
      "commanders",
      "cards",
      "blog",
      "meta",
      "strategies",
      "commander-archetypes",
    ];

    const commanderSlugs = getFirst50CommanderSlugs().slice(0, 50);
    const blogSlugs = BLOG_SLUGS_LATEST.slice(0, 20);
    const seoLimit = Math.max(0, limit - staticPaths.length - commanderSlugs.length - blogSlugs.length);
    const seoPages = await getPublishedSeoPagesForSitemap(seoLimit).catch(() => []);

    const urls: string[] = [
      ...staticPaths.map((p) => (p ? `${BASE}/${p}` : BASE)),
      ...commanderSlugs.map((s) => `${BASE}/commanders/${s}`),
      ...blogSlugs.map((s) => `${BASE}/blog/${s}`),
      ...seoPages.map((p) => `${BASE}/q/${p.slug}`),
    ].slice(0, limit);

    if (format === "text") {
      return new NextResponse(urls.join("\n"), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return NextResponse.json({ urls });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
