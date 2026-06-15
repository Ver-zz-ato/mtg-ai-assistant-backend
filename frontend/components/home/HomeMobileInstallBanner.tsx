"use client";

import Link from "next/link";
import { Apple } from "lucide-react";
import { APP_STORE_URLS, ANDROID_APP_LIVE } from "@/lib/home/homeConfig";
import { useHomeMobilePlatform } from "@/lib/home/useHomeMobilePlatform";

function GooglePlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path fill="#34A853" d="M4.4 2.4c-.3.2-.4.6-.4 1.1v17c0 .5.2.9.5 1.1l9-9.6-9.1-9.6Z" />
      <path fill="#FBBC04" d="m16.5 9.1-3-1.7L4.7 2.3l8.8 9.7 3-2.9Z" />
      <path fill="#4285F4" d="m4.7 21.7 8.8-9.7-3-2.9-6 12.6h.2Z" />
      <path fill="#EA4335" d="M20 10.3 16.5 9l-3 3 3 3 3.5-1.9c1.3-.8 1.3-2.1 0-2.8Z" />
    </svg>
  );
}

export default function HomeMobileInstallBanner() {
  const { ready, isMobile, platform } = useHomeMobilePlatform();

  if (!ready || !isMobile) return null;

  const isIos = platform === "ios";
  const isAndroid = platform === "android";

  return (
    <section className="mt-5 sm:mt-6" aria-label="Install ManaTap app">
      <div className="flex flex-col gap-3 rounded-xl border border-amber-300/25 bg-[linear-gradient(135deg,rgba(12,10,9,0.95),rgba(24,20,15,0.92))] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
            ManaTap mobile
          </p>
          <p className="mt-1 text-sm font-bold text-white">
            {isIos
              ? "Get the full ManaTap experience on your iPhone."
              : isAndroid && !ANDROID_APP_LIVE
                ? "Android version arriving soon."
                : "Take ManaTap to game night."}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-400">
            {isIos
              ? "Deck tools, scans, collections, and AI help in your pocket."
              : isAndroid && !ANDROID_APP_LIVE
                ? "iPhone is live now — Android is launching in the next few days."
                : "Install the app for the best mobile workflow."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isIos || (!isAndroid && !isIos) ? (
            <a
              href={APP_STORE_URLS.ios}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white px-4 py-2 text-xs font-bold text-neutral-950 transition hover:bg-amber-100"
            >
              <Apple aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
              App Store
            </a>
          ) : null}
          {isAndroid && ANDROID_APP_LIVE ? (
            <a
              href={APP_STORE_URLS.android}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/12 px-4 py-2 text-xs font-bold text-cyan-100"
            >
              <GooglePlayIcon />
              Google Play
            </a>
          ) : isAndroid ? (
            <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-500">
              Google Play — coming soon
            </span>
          ) : null}
          <Link
            href="/get"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-white/5"
          >
            Learn more
          </Link>
        </div>
      </div>
    </section>
  );
}
