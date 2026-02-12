// app/sitemap.ts
import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAllCommanderSlugs } from "@/lib/commander-slugs";

const BASE = "https://www.manatap.ai";
const now = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    "", // homepage
    "my-decks", // user deck management
    "collections", // MTG collections
    "profile", // user profiles
    "wishlist", // user wishlists
    "pricing", // subscription plans
    "privacy", // privacy policy
    "terms", // terms of service
    "support", // help/support
    "changelog", // what's new
    "price-tracker", // price tracking tool
    "tools/probability", // probability calculator
    "tools/mulligan", // mulligan simulator
    "collections/cost-to-finish", // cost to finish calculator
    "decks/browse", // browse public decks
    "deck/swap-suggestions", // budget swaps (canonical; budget-swaps redirects here)
    "blog", // blog index
    "mtg-commander-ai-deck-builder", // SEO hero landing page
    // Intent landing pages
    "commander-mulligan-calculator",
    "mtg-probability-calculator",
    "mtg-deck-cost-calculator",
    "mtg-budget-swap-tool",
  ].map((p) => ({
    url: `${BASE}/${p}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 0.8 : p === "mtg-commander-ai-deck-builder" ? 0.9 : p.startsWith("tools/") ? 0.5 : 0.6,
  }));

  // Add blog posts to sitemap
  const blogPosts = [
    "devlog-23-days-soft-launch",
    "welcome-to-manatap-ai-soft-launch",
    "budget-commander-100",
    "mana-curve-mastery",
    "budget-edh-hidden-gems",
    "how-to-build-your-first-commander-deck",
    "the-7-most-common-deckbuilding-mistakes",
    "edh-land-count-what-the-community-actually-runs",
    "top-budget-staples-every-mtg-player-should-know-2025",
  ].map((slug) => ({
    url: `${BASE}/blog/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Commander hub pages (from commander_profiles)
  const commanderRoutes = getAllCommanderSlugs().map((slug) => ({
    url: `${BASE}/commanders/${slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  // Public decks updated in last 30 days (cap at 300 for sitemap safety)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const supabase = await createClient();
  let publicDeckRoutes: MetadataRoute.Sitemap = [];

  try {
    const { data: publicDecks } = await supabase
      .from("decks")
      .select("id, updated_at")
      .eq("is_public", true)
      .gte("updated_at", thirtyDaysAgo.toISOString())
      .order("updated_at", { ascending: false })
      .limit(300);

    if (publicDecks && publicDecks.length > 0) {
      publicDeckRoutes = publicDecks.map((deck) => ({
        url: `${BASE}/decks/${deck.id}`,
        lastModified: deck.updated_at ? new Date(deck.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    }
  } catch (error) {
    console.error("[Sitemap] Failed to fetch public decks:", error);
  }

  return [...staticRoutes, ...blogPosts, ...commanderRoutes, ...publicDeckRoutes];
}