// app/sitemap.ts
import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const BASE = "https://manatap.ai";
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
  ].map((p) => ({
    url: `${BASE}/${p}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 0.8 : p.startsWith("tools/") ? 0.5 : 0.6,
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

  return [...staticRoutes, ...publicDeckRoutes];
}