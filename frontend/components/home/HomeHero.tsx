"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HOME_HERO_COPY, HOME_HERO_TOOLS } from "@/lib/home/homeConfig";
import { useHomeMobilePlatform } from "@/lib/home/useHomeMobilePlatform";
import { CHAT_ROUTE } from "@/lib/navigation/chatRoute";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-center text-sm font-bold text-white shadow-[0_12px_30px_rgba(139,92,246,0.35)] transition hover:from-violet-400 hover:to-fuchsia-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70";
const aiBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-6 py-3 text-center text-sm font-bold text-white shadow-[0_12px_30px_rgba(34,211,238,0.35)] transition hover:from-cyan-400 hover:to-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-center text-sm font-bold text-white transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

export default function HomeHero() {
  const [failedImgs, setFailedImgs] = useState<Set<number>>(new Set());
  const { ready, isMobile } = useHomeMobilePlatform();

  const showMobileCtas = !ready || isMobile;

  return (
    <section className="relative px-1 py-6 sm:px-2 sm:py-8 lg:py-10">
      <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-300">
            {HOME_HERO_COPY.kicker}
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
            {HOME_HERO_COPY.headline}
          </h1>
          <p className="mt-3 text-lg font-semibold text-neutral-100 sm:text-xl">
            {HOME_HERO_COPY.subheadline}
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">
            {HOME_HERO_COPY.supporting}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {showMobileCtas ? (
              <>
                <Link href="/get" className={primaryBtn}>
                  Download App
                </Link>
                <Link href="/tools" className={secondaryBtn}>
                  Explore Tools
                </Link>
              </>
            ) : (
              <>
                <Link href="/tools" className={primaryBtn}>
                  Explore Tools
                </Link>
                <Link href={CHAT_ROUTE} className={aiBtn}>
                  Ask ManaTap ✨
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-3 shadow-inner shadow-black/40 sm:p-4">
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
              Popular tools
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {HOME_HERO_TOOLS.map((tool, index) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/80 transition hover:border-violet-400/40 hover:shadow-[0_8px_24px_rgba(139,92,246,0.15)]"
                >
                  {!failedImgs.has(index) ? (
                    <Image
                      src={tool.img}
                      alt={tool.alt}
                      fill
                      sizes="(max-width: 640px) 50vw, 200px"
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                      onError={() => setFailedImgs((prev) => new Set(prev).add(index))}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 p-2 text-center text-xs font-semibold text-neutral-300">
                      {tool.alt}
                    </div>
                  )}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <Link
                href="/tools"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-violet-300/35 bg-violet-400/10 px-4 py-2 text-sm font-bold text-violet-100 transition hover:border-violet-200/60 hover:bg-violet-400/15"
              >
                View all tools
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
