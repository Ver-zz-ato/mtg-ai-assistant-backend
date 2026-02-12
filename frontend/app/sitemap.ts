import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getFirst50CommanderSlugs } from "@/lib/commanders";

const BASE = "https://www.manatap.ai";
const CONTENT_PAGES = ["mulligan-guide", "budget-upgrades", "best-cards"] as const;
const now = new Date();

/** Sitemap index: references child sitemaps at /sitemap/[id].xml */
export async function generateSitemaps() {
  return [
    { id: "static" },
    { id: "tools" },
    { id: "commanders" },
    { id: "commander-content" },
    { id: "decks-recent" },
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

    default:
      return [];
  }
}
