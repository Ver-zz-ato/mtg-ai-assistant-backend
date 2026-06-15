import Link from "next/link";
import { Check } from "lucide-react";
import { HOME_PRO_BENEFITS } from "@/lib/home/homeConfig";

export default function HomeProCta() {
  return (
    <section className="mt-8 sm:mt-10" aria-labelledby="home-pro-cta-heading">
      <div className="rounded-2xl border border-violet-400/25 bg-[linear-gradient(135deg,rgba(12,10,24,0.92),rgba(8,8,14,0.9))] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="home-pro-cta-heading" className="text-xl font-black text-white sm:text-2xl">
              ManaTap Pro
            </h2>
            <p className="mt-1 text-sm text-violet-200/90">Less than a booster pack per month.</p>
            <ul className="mt-3 space-y-1.5">
              {HOME_PRO_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm text-neutral-300">
                  <Check size={14} className="shrink-0 text-emerald-400" aria-hidden="true" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/pricing"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white transition hover:from-violet-400 hover:to-fuchsia-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"
            >
              View Pricing
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
