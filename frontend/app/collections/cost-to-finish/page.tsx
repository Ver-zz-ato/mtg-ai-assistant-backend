// frontend/app/collections/cost-to-finish/page.tsx
import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cost to Finish • MTG Coach",
  description:
    "Paste a decklist or deep link a public deck and estimate the cost to finish. Optionally subtract owned from a selected collection.",
  openGraph: {
    title: "Cost to Finish • MTG Coach",
    description:
      "Estimate the cost to finish a deck. Subtract owned from your collection.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cost to Finish • MTG Coach",
    description:
      "Estimate the cost to finish a deck. Subtract owned from your collection.",
  },
  alternates: { canonical: "https://manatap.ai/collections/cost-to-finish" },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Cost to Finish</h1>
      <Client />
    </main>
  );
}
