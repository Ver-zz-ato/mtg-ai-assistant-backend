"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HOME_APP_SHOWCASE } from "@/lib/home/homeConfig";

export default function HomeAppScreenshots() {
  const [failed, setFailed] = useState<Set<number>>(new Set());

  return (
    <div className="mt-6 lg:mt-0">
      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar sm:gap-4">
        {HOME_APP_SHOWCASE.map((shot, index) => (
          <Link
            key={shot.label}
            href={shot.href}
            className="group shrink-0"
            aria-label={`Open ${shot.label}`}
          >
            <div className="relative w-[148px] overflow-hidden rounded-[1.35rem] border border-white/15 bg-black p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] transition group-hover:border-amber-300/35 sm:w-[168px]">
              <div className="absolute left-1/2 top-2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />
              <div className="relative mt-3 aspect-[9/19] overflow-hidden rounded-[1rem] border border-white/10 bg-neutral-900">
                {!failed.has(index) ? (
                  <Image
                    src={shot.img}
                    alt={`${shot.label} preview`}
                    fill
                    sizes="168px"
                    className="object-cover object-top transition duration-300 group-hover:scale-[1.02]"
                    onError={() => setFailed((prev) => new Set(prev).add(index))}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-neutral-400">
                    {shot.label}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-neutral-300 group-hover:text-white">
              {shot.label}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
