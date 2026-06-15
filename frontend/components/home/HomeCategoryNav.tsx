import Link from "next/link";
import { HOME_PILLARS } from "@/lib/home/homeConfig";

export default function HomeCategoryNav() {
  return (
    <nav className="mt-8 border-t border-white/5 pt-6 pb-2 sm:mt-10" aria-label="Browse by workflow">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
        Browse by workflow
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {HOME_PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Link
              key={pillar.id}
              href={pillar.categoryHref}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 ${pillar.navPillClass}`}
            >
              <Icon size={14} aria-hidden="true" className="shrink-0 opacity-90" />
              {pillar.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
