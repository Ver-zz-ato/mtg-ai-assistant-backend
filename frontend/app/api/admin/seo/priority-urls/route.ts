/**
 * Returns priority URLs for manual GSC "Request indexing" after major deploys.
 * Protected: admin auth or the shared cron verifier.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getFirst50CommanderSlugs } from "@/lib/commanders";
import { getPublishedSeoPagesForSitemap } from "@/lib/seo-pages";
import { logUnauthorizedCronAttempt, verifyCronRequest } from "@/lib/server/verifyCronRequest";

const BASE = "https://www.manatap.ai";

const BLOG_SLUGS_LATEST = [
  "how-manatap-ai-works-updated",
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
  if (verifyCronRequest(req, { routePath: "/api/admin/seo/priority-urls", logUnauthorizedOnFailure: false })) {
    return true;
  }

  const adminToken = String(req.headers.get("x-admin-token") || "").trim();
  const expectedAdminToken = String(process.env.ADMIN_TOKEN || "").trim();
  if (expectedAdminToken && adminToken === expectedAdminToken) {
    return true;
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!(user && isAdmin(user));
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      logUnauthorizedCronAttempt(req, { routePath: "/api/admin/seo/priority-urls" });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const limit = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "100", 10)), 200);
    const format = req.nextUrl.searchParams.get("format") || "json";

    const staticPaths = ["", "commanders", "cards", "blog", "meta", "strategies", "commander-archetypes"];
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
