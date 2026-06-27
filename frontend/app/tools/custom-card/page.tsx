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
      <section className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <CustomCardCreator />
          </div>
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <CustomCardSideRail />
          </aside>
        </div>
      </section>
    </main>
  );
}

function CustomCardSideRail() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200">Creator flow</p>
        <div className="mt-4 space-y-2">
          {[
            ["Prompt", "Describe the joke, persona, or commander vibe."],
            ["Tune", "Pick style and power, then edit the face directly."],
            ["Art", "Choose Scryfall-sourced art with artist credit."],
            ["Share", "Attach to profile, copy link, or show QR."],
          ].map(([label, copy], index) => (
            <div key={label} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
              <p className="text-sm font-black text-white">{index + 1}. {label}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-400">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Prompt starters</p>
        <div className="mt-3 space-y-2 text-sm text-neutral-300">
          <p className="rounded-lg border border-neutral-800 bg-black/30 p-3">A graveyard wizard who turns failed combos into value.</p>
          <p className="rounded-lg border border-neutral-800 bg-black/30 p-3">A chaotic red mage built around coin flips and bad decisions.</p>
          <p className="rounded-lg border border-neutral-800 bg-black/30 p-3">A noble token commander who wins through tiny creatures.</p>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Related</p>
        <div className="mt-3 grid gap-2">
          {[
            { href: "/profile", label: "Profile", sub: "See attached custom cards" },
            { href: "/tools/playstyle-quiz", label: "Playstyle Quiz", sub: "Find a vibe first" },
            { href: "/build-a-deck", label: "Deck Builder", sub: "Turn the joke into a deck" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg border border-neutral-800 bg-black/30 p-3 transition hover:border-cyan-300/45 hover:bg-cyan-300/5">
              <span className="block text-sm font-black text-white">{item.label}</span>
              <span className="mt-1 block text-xs text-neutral-500">{item.sub}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
