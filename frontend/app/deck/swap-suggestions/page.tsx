import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Budget Swaps • MTG Coach",
  description: "Paste a decklist and see cheaper, similar alternatives for expensive cards.",
};

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Budget Swaps</h1>
      <Client />
    </main>
  );
}