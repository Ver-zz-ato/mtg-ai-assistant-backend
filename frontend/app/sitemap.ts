import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCommanderSlugsWithUpdatedAt } from "@/lib/commanders";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";
import { getTopCards } from "@/lib/top-cards";
import { getPublishedSeoPagesForSitemap } from "@/lib/seo-pages";

const BASE = "https://www.manatap.ai";
const CONTENT_PAGES = ["mulligan-guide", "budget-upgrades", "best-cards"] as const;
const META_SLUGS = ["trending-commanders", "most-played-commanders", "budget-commanders", "trending-cards", "most-played-cards"] as const;

// Force fresh sitemap - no caching
export const revalidate = 0;
export const dynamic = "force-dynamic";

/** Sitemap index: references child sitemaps at /sitemap/[id].xml */
export async function generateSitemaps() {
  return [
    { id: "static" },
    { id: "tools" },
    { id: "commanders" },
    { id: "commander-content" },
    { id: "decks-recent" },
    { id: "archetypes" },
    { id: "strategies" },
    { id: "meta" },
    { id: "cards" },
    { id: "seo-pages" },
  ];
}

export default async function sitemap(props: {
  id: string | Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = typeof props.id === "string" ? props.id : await props.id;
  switch (id) {
    case "static": {
      const now = new Date();
      const routes = [
        "",
        "my-decks",
        "collections",
        "profile",
        "wishlist",
        "pricing",
        "privacy",
        "terms",
        "support",
        "changelog",
        "price-tracker",
        "tools",
        "tools/probability",
        "tools/mulligan",
        "collections/cost-to-finish",
        "decks/browse",
        "deck/swap-suggestions",
        "blog",
        "mtg-commander-ai-deck-builder",
        "commander-mulligan-calculator",
        "mtg-probability-calculator",
        "mtg-deck-cost-calculator",
        "mtg-budget-swap-tool",
        "commanders",
        "commander-archetypes",
        "strategies",
        "meta",
        "cards",
      ];
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
      ];
      const entries: MetadataRoute.Sitemap = [
        ...routes.map((p) => ({
          url: `${BASE}/${p}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: p === "" ? 0.8 : p === "mtg-commander-ai-deck-builder" ? 0.9 : p.startsWith("tools") ? 0.5 : 0.6,
        })),
        ...blogPosts.map((slug) => ({
          url: `${BASE}/blog/${slug}`,
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.7,
        })),
      ];
      console.log(`[Sitemap static] Generated at ${now.toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "tools": {
      const now = new Date();
      const entries = [
        "tools",
        "tools/probability",
        "tools/mulligan",
        "collections/cost-to-finish",
        "deck/swap-suggestions",
        "price-tracker",
        "commander-mulligan-calculator",
        "mtg-probability-calculator",
        "mtg-deck-cost-calculator",
        "mtg-budget-swap-tool",
      ].map((p) => ({
        url: `${BASE}/${p}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
      console.log(`[Sitemap tools] Generated at ${now.toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "commanders": {
      const commanders = await getCommanderSlugsWithUpdatedAt().catch(() => []);
      const entries = commanders.map(({ slug, updated_at }) => ({
        url: `${BASE}/commanders/${slug}`,
        lastModified: new Date(updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
      console.log(`[Sitemap commanders] Generated at ${new Date().toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "commander-content": {
      const commanders = await getCommanderSlugsWithUpdatedAt().catch(() => []);
      const entries: MetadataRoute.Sitemap = [];
      for (const { slug, updated_at } of commanders) {
        for (const page of CONTENT_PAGES) {
          entries.push({
            url: `${BASE}/commanders/${slug}/${page}`,
            lastModified: new Date(updated_at),
            changeFrequency: "monthly" as const,
            priority: 0.4,
          });
        }
      }
      console.log(`[Sitemap commander-content] Generated at ${new Date().toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "decks-recent": {
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
            lastModified: deck.updated_at ? new Date(deck.updated_at) : new Date(),
            changeFrequency: "weekly" as const,
            priority: 0.5,
          }));
        }
      } catch (error) {
        console.error("[Sitemap decks-recent] Failed:", error);
      }

      console.log(`[Sitemap decks-recent] Generated at ${new Date().toISOString()}, ${publicDeckRoutes.length} URLs`);
      return publicDeckRoutes;
    }

    case "archetypes": {
      const now = new Date();
      const entries = [
        { url: `${BASE}/commander-archetypes`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...ARCHETYPES.map((a) => ({
          url: `${BASE}/commander-archetypes/${a.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
      ];
      console.log(`[Sitemap archetypes] Generated at ${now.toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "strategies": {
      const now = new Date();
      const entries = [
        { url: `${BASE}/strategies`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...STRATEGIES.map((s) => ({
          url: `${BASE}/strategies/${s.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
      ];
      console.log(`[Sitemap strategies] Generated at ${now.toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "meta": {
      const now = new Date();
      const entries = [
        { url: `${BASE}/meta`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...META_SLUGS.map((slug) => ({
          url: `${BASE}/meta/${slug}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.6,
        })),
      ];
      console.log(`[Sitemap meta] Generated at ${now.toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "cards": {
      const topCards = await getTopCards().catch(() => []);
      const now = new Date();
      const entries = [
        { url: `${BASE}/cards`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...topCards.map((c) => ({
          url: `${BASE}/cards/${c.slug}`,
          lastModified: c.updated_at ? new Date(c.updated_at) : now,
          changeFrequency: "weekly" as const,
          priority: 0.5,
        })),
      ];
      console.log(`[Sitemap cards] Generated at ${now.toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    case "seo-pages": {
      const pages = await getPublishedSeoPagesForSitemap(500).catch(() => []);
      const entries = pages.map(({ slug, updated_at }) => ({
        url: `${BASE}/q/${slug}`,
        lastModified: new Date(updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
      console.log(`[Sitemap seo-pages] Generated at ${new Date().toISOString()}, ${entries.length} URLs`);
      return entries;
    }

    default:
      return [];
  }
}
