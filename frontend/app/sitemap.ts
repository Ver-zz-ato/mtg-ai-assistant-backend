import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getFirst50CommanderSlugs } from "@/lib/commanders";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";
import { getTopCards } from "@/lib/top-cards";
import { getPublishedSeoPageSlugs } from "@/lib/seo-pages";

const BASE = "https://www.manatap.ai";
const CONTENT_PAGES = ["mulligan-guide", "budget-upgrades", "best-cards"] as const;
const META_SLUGS = ["trending-commanders", "most-played-commanders", "budget-commanders", "trending-cards", "most-played-cards"] as const;
const now = new Date();

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
      return [
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
    }

    case "tools": {
      return [
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
    }

    case "commanders": {
      const slugs = getFirst50CommanderSlugs();
      return slugs.map((slug) => ({
        url: `${BASE}/commanders/${slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    }

    case "commander-content": {
      const slugs = getFirst50CommanderSlugs();
      const entries: MetadataRoute.Sitemap = [];
      for (const slug of slugs) {
        for (const page of CONTENT_PAGES) {
          entries.push({
            url: `${BASE}/commanders/${slug}/${page}`,
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.4,
          });
        }
      }
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
            lastModified: deck.updated_at ? new Date(deck.updated_at) : now,
            changeFrequency: "weekly" as const,
            priority: 0.5,
          }));
        }
      } catch (error) {
        console.error("[Sitemap decks-recent] Failed:", error);
      }

      return publicDeckRoutes;
    }

    case "archetypes": {
      return [
        { url: `${BASE}/commander-archetypes`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...ARCHETYPES.map((a) => ({
          url: `${BASE}/commander-archetypes/${a.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
      ];
    }

    case "strategies": {
      return [
        { url: `${BASE}/strategies`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...STRATEGIES.map((s) => ({
          url: `${BASE}/strategies/${s.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
      ];
    }

    case "meta": {
      return [
        { url: `${BASE}/meta`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...META_SLUGS.map((slug) => ({
          url: `${BASE}/meta/${slug}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.6,
        })),
      ];
    }

    case "cards": {
      const topCards = await getTopCards();
      return [
        { url: `${BASE}/cards`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
        ...topCards.map((c) => ({
          url: `${BASE}/cards/${c.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.5,
        })),
      ];
    }

    case "seo-pages": {
      const slugs = await getPublishedSeoPageSlugs(500);
      return slugs.map((slug) => ({
        url: `${BASE}/q/${slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    }

    default:
      return [];
  }
}
