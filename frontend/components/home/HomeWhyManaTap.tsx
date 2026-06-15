import { Check } from "lucide-react";
import { HOME_WHY_ITEMS } from "@/lib/home/homeConfig";

export default function HomeWhyManaTap() {
  return (
    <section className="mt-5 sm:mt-6">
      <div className="rounded-xl border border-white/10 bg-neutral-950/45 px-4 py-4 sm:px-5 sm:py-4">
        <h2 className="text-base font-black text-white sm:text-lg">Why ManaTap?</h2>
        <p className="mt-1 text-xs text-neutral-400 sm:text-sm">
          One companion for brewing, upgrading, tracking, and playing smarter.
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {HOME_WHY_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs font-medium text-neutral-300 sm:text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                <Check size={12} aria-hidden="true" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
