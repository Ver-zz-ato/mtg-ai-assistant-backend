import type { Metadata } from "next";
import HybridHomePage from "@/components/home/HybridHomePage";
import { costAuditHomepageRender } from "@/lib/observability/cost-audit-server";
import {
  HOME_DESCRIPTION,
  SITE_LAST_UPDATED_ISO,
  canonicalMeta,
} from "@/lib/seo/metadata";

export const metadata: Metadata = canonicalMeta("/", {
  title: "ManaTap AI — MTG Deck Builder & Assistant",
  description: HOME_DESCRIPTION,
});

function jsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ManaTap AI",
    description:
      "Magic: The Gathering deck building companion with AI chat, deck analysis, budget swaps, collection tools, mulligan simulation, and Commander discovery.",
    url: "https://www.manatap.ai",
    applicationCategory: "GameApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    publisher: {
      "@type": "Organization",
      name: "ManaTap.ai",
      url: "https://www.manatap.ai",
    },
    dateModified: SITE_LAST_UPDATED_ISO,
    featureList: [
      "Deck Builder",
      "Deck Checker",
      "AI Chat Assistant",
      "Budget Swaps",
      "Price Tracking",
      "Collection Management",
      "Mulligan Simulator",
      "Commander Guides",
    ],
  };
  return JSON.stringify(data);
}

export default function Page() {
  costAuditHomepageRender({ homeVariant: "hybrid" });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <HybridHomePage />
    </>
  );
}
