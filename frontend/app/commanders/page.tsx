import type { Metadata } from "next";
import Link from "next/link";
import { COMMANDERS } from "@/lib/commanders";
import { CommanderLinkWithHover } from "@/components/CommanderLinkWithHover";

export const metadata: Metadata = {
  title: "Commander Tools & Guides | Mulligan, Cost, Budget | ManaTap",
  description:
    "Commander-specific tools and guides. Mulligan strategy, budget upgrades, best cards. Browse 50+ commanders. Free EDH tools from ManaTap.",
  alternates: { canonical: "https://www.manatap.ai/commanders" },
};

const BASE = "https://www.manatap.ai";

function breadcrumbJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Commanders", item: `${BASE}/commanders` },
    ],
  });
}

export default function CommandersIndexPage() {
  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd() }} />
      <article className="text-neutral-200">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Commander Tools & Guides
        </h1>
        <p className="text-neutral-300 mb-6 text-lg leading-relaxed">
          Build and optimize your Commander deck with ManaTap's free tools. For each commander below,
          you get a hub with links to the mulligan simulator, cost-to-finish calculator, budget swap
          tool, and browse decks. Plus in-depth guides on mulligan strategy, budget upgrades, and
          best cards by role.
        </p>
        <p className="text-neutral-300 mb-8 text-lg leading-relaxed">
          All content is SSR and indexable. No signup required to use the tools. Paste your decklist
          or load from your account to get started.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Commanders</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {COMMANDERS.map((c) => (
            <li key={c.slug}>
              <CommanderLinkWithHover href={`/commanders/${c.slug}`} name={c.name} />
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
