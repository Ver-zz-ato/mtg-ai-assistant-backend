import Link from "next/link";
import { Apple } from "lucide-react";
import { APP_STORE_URLS } from "@/lib/home/homeConfig";

function GooglePlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#34A853" d="M4.4 2.4c-.3.2-.4.6-.4 1.1v17c0 .5.2.9.5 1.1l9-9.6-9.1-9.6Z" />
      <path fill="#FBBC04" d="m16.5 9.1-3-1.7L4.7 2.3l8.8 9.7 3-2.9Z" />
      <path fill="#4285F4" d="m4.7 21.7 8.8-9.7-3-2.9-6 12.6h.2Z" />
      <path fill="#EA4335" d="M20 10.3 16.5 9l-3 3 3 3 3.5-1.9c1.3-.8 1.3-2.1 0-2.8Z" />
    </svg>
  );
}

export default function HomeAppSection() {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="relative overflow-hidden rounded-2xl border border-amber-300/22 bg-[linear-gradient(145deg,rgba(10,10,10,0.94),rgba(17,17,18,0.82)_52%,rgba(13,20,19,0.86))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_70px_rgba(0,0,0,0.38)] sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">
              Mobile app
            </p>
            <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
              ManaTap is built for your phone too
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-300 sm:text-base">
              Deck tools, AI help, collections, and game-night workflows are available on mobile.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <a
              href={APP_STORE_URLS.ios}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white px-5 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            >
              <Apple aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              App Store
            </a>
            <a
              href={APP_STORE_URLS.android}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/12 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
            >
              <GooglePlayIcon />
              Google Play
            </a>
            <Link
              href="/get"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-neutral-200 transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Get the app →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
