/** Shared accent pill tokens for sidebar / tool nav chips. */
export const ACCENT_PILL_CLASSES = [
  "border-violet-300/35 bg-violet-500/12 text-violet-100 hover:border-violet-300/55 hover:bg-violet-500/18",
  "border-cyan-300/35 bg-cyan-500/12 text-cyan-100 hover:border-cyan-300/55 hover:bg-cyan-500/18",
  "border-emerald-300/35 bg-emerald-500/12 text-emerald-100 hover:border-emerald-300/55 hover:bg-emerald-500/18",
  "border-amber-300/35 bg-amber-500/12 text-amber-100 hover:border-amber-300/55 hover:bg-amber-500/18",
  "border-fuchsia-300/35 bg-fuchsia-500/12 text-fuchsia-100 hover:border-fuchsia-300/55 hover:bg-fuchsia-500/18",
  "border-sky-300/35 bg-sky-500/12 text-sky-100 hover:border-sky-300/55 hover:bg-sky-500/18",
  "border-rose-300/35 bg-rose-500/12 text-rose-100 hover:border-rose-300/55 hover:bg-rose-500/18",
  "border-lime-300/35 bg-lime-500/12 text-lime-100 hover:border-lime-300/55 hover:bg-lime-500/18",
] as const;

export const PILL_BASE_CLASS =
  "inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40";

export function pillClassAt(index: number): string {
  return ACCENT_PILL_CLASSES[index % ACCENT_PILL_CLASSES.length];
}
