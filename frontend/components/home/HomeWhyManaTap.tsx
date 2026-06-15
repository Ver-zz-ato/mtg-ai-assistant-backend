import { Check } from "lucide-react";
import { HOME_WHY_ITEMS } from "@/lib/home/homeConfig";

export default function HomeWhyManaTap() {
  return (
    <section className="mt-6 sm:mt-8">
      <div className="rounded-2xl border border-white/10 bg-neutral-950/55 px-4 py-5 sm:px-6 sm:py-6">
        <h2 className="text-lg font-black text-white sm:text-xl">Why ManaTap?</h2>
        <p className="mt-1 text-sm text-neutral-400">
          One companion for brewing, upgrading, tracking, and playing smarter.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {HOME_WHY_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-sm font-medium text-neutral-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                <Check size={14} aria-hidden="true" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
