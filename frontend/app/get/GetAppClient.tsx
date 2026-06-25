"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Apple } from "lucide-react";
import AppScreenshotCarousel from "@/components/mobile/AppScreenshotCarousel";
import { MANATAP_DISCORD_INVITE_URL } from "@/lib/manatap-links";
import { capture } from "@/lib/ph";

const IOS_STORE_URL = "https://apps.apple.com/app/id6774626559";
const ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.manatap.app";

type PlatformTarget = "ios" | "android" | "unknown";

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
  useEffect(() => {
    const detected = detectPlatform(window.navigator.userAgent);

    const target = storeUrlFor(detected);
    if (!target) return;

    window.location.replace(target);
  }, []);

  return (
    <section className="mx-auto flex min-h-[72vh] w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-10">
      <div className="w-full overflow-hidden rounded-[28px] border border-amber-300/25 bg-neutral-950/82 shadow-2xl shadow-black/45">
        <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative p-6 sm:p-8 lg:p-14 xl:p-16">
            <div className="mb-5 inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-200">
              ManaTap Mobile
            </div>
            <h1 className="max-w-2xl text-4xl font-black leading-tight text-white sm:text-5xl">
              The faster way to brew, scan, and tune MTG decks.
            </h1>
            <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-neutral-300 sm:text-lg">
              ManaTap brings deck tuning, card scanning, collection tracking, and AI-backed upgrade ideas into your pocket.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <a
                href={IOS_STORE_URL}
                className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white px-7 py-5 text-center text-base font-black text-neutral-950 transition hover:bg-amber-100"
              >
                <Apple aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2.5} />
                Download on App Store
              </a>
              <a
                href={ANDROID_STORE_URL}
                className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-300/12 px-7 py-5 text-center text-base font-black text-cyan-100 transition hover:bg-cyan-300/18"
              >
                <GooglePlayIcon />
                Get it on Google Play
              </a>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-stretch">
              <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-3xl border border-amber-200/20 bg-white p-3 shadow-2xl shadow-black/35 sm:mx-0 lg:h-56 lg:w-56">
                <Image
                  src="/app-screenshots/manatap-get-qr-with-logo.png"
                  alt="QR code for the ManaTap app download page"
                  width={220}
                  height={220}
                  className="h-full w-full"
                  sizes="(min-width: 1024px) 224px, (min-width: 640px) 208px, 176px"
                />
              </div>

              <div className="flex min-h-52 flex-col justify-center rounded-3xl border border-indigo-400/25 bg-indigo-500/12 p-6 lg:min-h-56">
                <p className="text-base font-black text-indigo-100">Join the ManaTap community</p>
                <p className="mt-2 text-sm leading-6 text-neutral-300">
                  Talk decks, share feedback, and meet other players on Discord.
                </p>
                <a
                  href={MANATAP_DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl border border-indigo-300/35 bg-indigo-600/85 px-6 py-3 text-base font-black text-white transition hover:bg-indigo-500 sm:w-fit"
                  onClick={() => { try { capture('discord_join_clicked', { location: 'get_app' }); } catch {} }}
                >
                  Join Discord
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-gradient-to-br from-amber-300/14 via-indigo-500/12 to-cyan-400/10 p-4 sm:p-6 lg:border-l lg:border-t-0 lg:p-8 xl:p-10">
            <div className="flex h-full items-center justify-center">
              <AppScreenshotCarousel
                className="w-full max-w-[320px] sm:max-w-[360px] lg:max-w-[430px] xl:max-w-[460px]"
                frameClassName="rounded-[2rem] border-amber-200/20"
                sizes="(min-width: 1280px) 460px, (min-width: 1024px) 430px, (min-width: 640px) 360px, 320px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
