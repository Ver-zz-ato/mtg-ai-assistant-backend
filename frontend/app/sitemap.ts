// app/sitemap.ts
import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

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
    "budget-swaps", // budget optimization tool
    "price-tracker", // price tracking tool
    "tools/probability", // probability calculator
    "tools/mulligan", // mulligan simulator
    "blog", // blog index
    "mtg-commander-ai-deck-builder", // SEO hero landing page
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

  // Fetch dynamic public decks
  const supabase = await createClient();
  let publicDeckRoutes: MetadataRoute.Sitemap = [];
  
  try {
    const { data: publicDecks } = await supabase
      .from('decks')
      .select('id, updated_at')
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(500); // Limit to avoid sitemap bloat
    
    if (publicDecks && publicDecks.length > 0) {
      publicDeckRoutes = publicDecks.map(deck => ({
        url: `${BASE}/decks/${deck.id}`,
        lastModified: deck.updated_at ? new Date(deck.updated_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }));
    }
  } catch (error) {
    console.error('[Sitemap] Failed to fetch public decks:', error);
  }

  return [...staticRoutes, ...blogPosts, ...publicDeckRoutes];
}