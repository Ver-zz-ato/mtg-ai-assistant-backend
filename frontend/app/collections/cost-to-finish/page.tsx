// frontend/app/collections/cost-to-finish/page.tsx
import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cost to Finish • ManaTap AI",
  description:
    "Paste a decklist and estimate the cost to finish. Optionally subtract owned from a selected collection.",
  openGraph: {
    title: "Cost to Finish • ManaTap AI",
    description:
      "Estimate the cost to finish a deck. Subtract owned from your collection.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cost to Finish • ManaTap AI",
    description:
      "Estimate the cost to finish a deck. Subtract owned from your collection.",
  },
  alternates: { canonical: "https://www.manatap.ai/collections/cost-to-finish" },
};

export default function Page() {
  return (
    <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
      <Client />
    </main>
  );
}
