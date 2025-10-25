// app/sitemap.ts
import type { MetadataRoute } from "next";

const BASE = "https://manatap.ai";
const now = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
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

  // TODO: fetch dynamic slugs from Supabase
  // - Public deck pages: /decks/[id] for is_public=true decks
  // - Public profile pages: /u/[slug] for public profiles  
  // - Public collection binders: /binder/[slug] for shared collections
  // Example implementation when ready:
  // const dynamicRoutes = await Promise.all([
  //   supabase.from('decks').select('id').eq('is_public', true),
  //   supabase.from('profiles').select('slug').eq('is_public', true)
  // ]).then(([decks, profiles]) => [
  //   ...decks.data?.map(d => ({ url: `${BASE}/decks/${d.id}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.5 })) || [],
  //   ...profiles.data?.map(p => ({ url: `${BASE}/u/${p.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.4 })) || []
  // ]);

  return [...staticRoutes /* , ...dynamicRoutes when implemented */];
}