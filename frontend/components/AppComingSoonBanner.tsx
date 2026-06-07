export default function AppComingSoonBanner() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 pt-2 pb-3">
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/35 bg-[radial-gradient(circle_at_12%_20%,rgba(245,158,11,0.24),transparent_28%),linear-gradient(135deg,rgba(12,10,9,0.96),rgba(24,24,27,0.96)_48%,rgba(120,53,15,0.72))] shadow-[0_18px_45px_rgba(0,0,0,0.38)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
        <div className="absolute -right-10 -top-16 h-36 w-36 rounded-full border border-amber-300/15 bg-amber-300/10 blur-2xl" />
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="relative flex h-12 w-10 shrink-0 items-center justify-center rounded-[1.1rem] border border-amber-200/40 bg-black/55 shadow-inner shadow-amber-200/10 sm:h-14 sm:w-11">
            <div className="absolute top-1.5 h-1 w-3 rounded-full bg-amber-100/70" />
            <div className="h-7 w-6 rounded-lg bg-gradient-to-br from-amber-300 via-yellow-500 to-emerald-400 shadow-[0_0_20px_rgba(245,158,11,0.35)] sm:h-8 sm:w-7" />
            <div className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-amber-100/70" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300/35 bg-amber-300/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">
                Mobile app
              </span>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                Coming very soon
              </span>
            </div>
            <div className="text-base font-bold leading-tight text-white sm:text-xl">
              ManaTap is heading to your phone.
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-amber-50/78 sm:text-sm">
              Deck tools, AI help, collections, and mobile-first MTG workflows are almost ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
