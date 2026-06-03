"use client";

import { useEffect, useMemo, useState } from "react";

const IOS_STORE_URL = "https://apps.apple.com/app/id6774626559";
const ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.manatap.app";

type PlatformTarget = "ios" | "android" | "unknown";

function detectPlatform(userAgent: string): PlatformTarget {
  const ua = userAgent.toLowerCase();
  if (/\b(android)\b/.test(ua)) return "android";
  if (/\b(iphone|ipad|ipod)\b/.test(ua)) return "ios";

  // iPadOS desktop-mode Safari can identify as Mac, but still has touch points.
  if (/\bmacintosh\b/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) {
    return "ios";
  }

  return "unknown";
}

function storeUrlFor(platform: PlatformTarget): string | null {
  if (platform === "ios") return IOS_STORE_URL;
  if (platform === "android") return ANDROID_STORE_URL;
  return null;
}

export default function GetAppClient() {
  const [platform, setPlatform] = useState<PlatformTarget>("unknown");

  useEffect(() => {
    const detected = detectPlatform(window.navigator.userAgent);
    setPlatform(detected);

    const target = storeUrlFor(detected);
    if (!target) return;

    const redirectTimer = window.setTimeout(() => {
      window.location.assign(target);
    }, 650);

    return () => window.clearTimeout(redirectTimer);
  }, []);

  const detectedLabel = useMemo(() => {
    if (platform === "ios") return "iPhone or iPad detected";
    if (platform === "android") return "Android detected";
    return "Choose your store";
  }, [platform]);

  const statusCopy =
    platform === "unknown"
      ? "Choose the store for your device below."
      : "Sending you to the right store. If nothing happens, choose below.";

  return (
    <section className="mx-auto flex min-h-[72vh] w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full overflow-hidden rounded-[28px] border border-amber-300/25 bg-neutral-950/82 shadow-2xl shadow-black/45">
        <div className="grid gap-0 lg:grid-cols-[1.04fr_0.96fr]">
          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="mb-5 inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-200">
              ManaTap Mobile
            </div>
            <h1 className="max-w-2xl text-4xl font-black leading-tight text-white sm:text-5xl">
              The faster way to brew, scan, and tune MTG decks.
            </h1>
            <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-neutral-300 sm:text-lg">
              ManaTap brings deck tuning, card scanning, collection tracking, and AI-backed upgrade ideas into your pocket.
            </p>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-200">{detectedLabel}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-300">{statusCopy}</p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <a
                href={IOS_STORE_URL}
                className="rounded-2xl border border-white/10 bg-white px-5 py-4 text-center text-sm font-black text-neutral-950 transition hover:bg-amber-100"
              >
                Download on App Store
              </a>
              <a
                href={ANDROID_STORE_URL}
                className="rounded-2xl border border-cyan-300/25 bg-cyan-300/12 px-5 py-4 text-center text-sm font-black text-cyan-100 transition hover:bg-cyan-300/18"
              >
                Get it on Google Play
              </a>
            </div>
          </div>

          <div className="border-t border-white/10 bg-gradient-to-br from-amber-300/14 via-indigo-500/12 to-cyan-400/10 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <div className="flex h-full flex-col justify-center rounded-3xl border border-white/10 bg-black/28 p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Built for game night</p>
              <div className="mt-5 grid gap-3 text-sm font-semibold leading-6 text-neutral-200">
                <p>Scan cards after trades.</p>
                <p>Sharpen decks before round one.</p>
                <p>Track collections and wishlists.</p>
                <p>Ask for smarter upgrade paths when the brew gets messy.</p>
              </div>
              <p className="mt-7 text-xs leading-5 text-neutral-500">
                This page is safe for printed QR codes: the URL can stay the same while store destinations change behind it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
