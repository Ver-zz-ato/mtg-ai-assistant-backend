"use client";

import { useEffect } from "react";
import { capture } from "@/lib/ph";

type SeoPage = {
  slug: string;
  template: string;
  query: string;
  commander_slug: string | null;
  card_name: string | null;
};

export function SeoLandingAnalytics({ page, slug }: { page: SeoPage; slug: string }) {
  useEffect(() => {
    capture("seo_landing_view", {
      slug,
      template: page.template,
      commander_slug: page.commander_slug ?? undefined,
      card_name: page.card_name ?? undefined,
      source_query: page.query,
    });
  }, [slug, page.template, page.query, page.commander_slug, page.card_name]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a[data-cta]");
      if (!link) return;
      const cta = (link as HTMLAnchorElement).getAttribute("data-cta");
      if (cta) {
        capture("seo_cta_clicked", {
          slug,
          cta: cta as "browse" | "mulligan" | "cost_to_finish" | "swaps" | "cards" | "commanders",
        });
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [slug]);

  return null;
}
