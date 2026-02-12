import type { Metadata } from "next";
import Link from "next/link";
import { STRATEGIES } from "@/lib/data/strategies";

export const metadata: Metadata = {
  title: "Commander Strategies | Ramp, Tokens, Control | ManaTap",
  description:
    "Commander strategy guides: ramp, tokens, sacrifice, control, aggro, combo. Find commanders and tools for each strategy.",
  alternates: { canonical: "https://www.manatap.ai/strategies" },
};

export default function StrategiesIndexPage() {
  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Strategies</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Commander Strategies
        </h1>
        <p className="text-neutral-300 mb-8 text-lg leading-relaxed">
          Explore Commander strategies—ramp, tokens, sacrifice, control, aggro, and combo. Each strategy has commanders and links to our free tools.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {STRATEGIES.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/strategies/${s.slug}`}
                className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
              >
                <h2 className="font-semibold text-white">{s.title}</h2>
                <p className="text-sm text-neutral-400 mt-1">{s.intro}</p>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
