import type { Metadata } from "next";
import Client from "./Client";
import { RelatedTools } from "@/components/RelatedTools";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Budget Swaps • ManaTap AI",
  description: "Paste a decklist and see cheaper, similar alternatives for expensive cards.",
  alternates: { canonical: "https://www.manatap.ai/deck/swap-suggestions" },
};

export default function Page() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-4">
      <section
        className="mb-6 max-w-4xl text-neutral-200"
        aria-label="About Budget Swaps"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Budget Swaps
        </h1>
        <p className="text-neutral-300 mb-4">
          Paste your decklist or select a deck to get cheaper alternatives for
          expensive cards. Quick Swaps uses a curated list of budget
          replacements for popular staples. AI-Powered Swaps (Pro) analyzes
          your deck&apos;s strategy to find cheaper cards that maintain synergies and
          theme — not just direct replacements.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          How it works
        </h2>
        <p className="text-neutral-300 mb-4">
          Set a budget threshold (e.g. $5 per card). The tool finds cards above
          that price and suggests alternatives. Compare before/after totals and
          export as CSV or apply swaps to a new deck. Fix card names if your
          paste has typos.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Use with your deck
        </h2>
        <p className="text-neutral-300 mb-6">
          Sign in to load decks from your ManaTap account. Or paste any
          decklist — the tool works with standard formats from Moxfield,
          Archidekt, or plain text.
        </p>
        <RelatedTools
          tools={[
            { href: "/tools/mulligan", label: "Commander Mulligan Simulator" },
            { href: "/tools/probability", label: "MTG Probability Calculator" },
            { href: "/collections/cost-to-finish", label: "Cost to Finish" },
          ]}
        />
      </section>
      <Client />
    </main>
  );
}
