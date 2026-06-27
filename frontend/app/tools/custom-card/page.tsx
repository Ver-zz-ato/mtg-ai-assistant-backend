import type { Metadata } from "next";
import Link from "next/link";
import CustomCardCreator from "@/components/CustomCardCreator";

export const metadata: Metadata = {
  title: "Custom Card Creator | ManaTap",
  description: "Create, save, and share fan-made Magic card profile cards with ManaTap.",
  alternates: { canonical: "https://www.manatap.ai/tools/custom-card" },
};

export default function CustomCardToolPage() {
  return (
    <main className="min-h-[calc(100vh-82px)] bg-[#050608] text-white">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/tools" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
              Tools
            </Link>
            <h1 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">Custom Card Creator</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Generate a playful fan-made card, edit the face, choose Scryfall-sourced art, then save it to your profile or share a public card page.
            </p>
          </div>
        </div>
        <CustomCardCreator />
      </section>
    </main>
  );
}
