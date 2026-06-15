import Link from "next/link";
import type { HomePopularTool } from "@/lib/home/homeConfig";

export default function HomeToolCard({ tool }: { tool: HomePopularTool }) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.href}
      className="group relative block h-full overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(145deg,rgba(18,18,18,0.92),rgba(7,7,8,0.82))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_45px_rgba(0,0,0,0.24)] outline-none transition duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-[linear-gradient(145deg,rgba(24,24,24,0.96),rgba(9,9,10,0.88))] focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      {tool.badge ? (
        <span className="absolute right-3 top-3 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100">
          {tool.badge}
        </span>
      ) : null}
      <div className="flex h-full items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${tool.accent}`}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col pr-16 sm:pr-20">
          <span className="text-[15px] font-bold leading-5 text-white group-hover:text-amber-100">
            {tool.title}
          </span>
          <span className="mt-1.5 block truncate text-sm text-neutral-400">{tool.subtitle}</span>
          <span className="mt-auto pt-3 text-xs font-semibold text-amber-200/0 transition group-hover:text-amber-200">
            Open →
          </span>
        </span>
      </div>
    </Link>
  );
}
