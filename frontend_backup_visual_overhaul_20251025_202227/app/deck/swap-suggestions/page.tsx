import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Budget Swaps • ManaTap AI",
  description: "Paste a decklist and see cheaper, similar alternatives for expensive cards.",
};

export default function Page() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-4">
      <Client />
    </main>
  );
}
