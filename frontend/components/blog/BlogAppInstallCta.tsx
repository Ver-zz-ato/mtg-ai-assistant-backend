"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AppStoreBadge, GooglePlayBadge } from "@/components/mobile/mobileStoreIcons";
import { capture } from "@/lib/ph";

const CTA_URL = "https://www.manatap.ai/get";
const PLACEMENT = "end_of_article";

function isBlogPostPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized.startsWith("/blog/");
}

export default function BlogAppInstallCta() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);
  const shouldRender = isBlogPostPath(pathname);

  useEffect(() => {
    if (!shouldRender) return;
    const node = containerRef.current;
    if (!node) return;

    const trackViewed = () => {
      if (viewedRef.current) return;
      viewedRef.current = true;
      capture("blog_app_cta_viewed", {
        placement: PLACEMENT,
        pathname,
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      trackViewed();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackViewed();
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [pathname, shouldRender]);

  if (!shouldRender) return null;

  const trackClicked = (target: "app_store_badge" | "google_play_badge" | "primary_button") => {
    capture("blog_app_cta_clicked", {
      placement: PLACEMENT,
      pathname,
      target,
      destination_url: CTA_URL,
    });
  };

  return (
    <section
      ref={containerRef}
      className="mx-auto w-full max-w-5xl px-4 pb-14 sm:px-6 lg:px-8"
      aria-label="Download ManaTap mobile app"
    >
      <div className="overflow-hidden rounded-3xl border border-amber-300/25 bg-[linear-gradient(135deg,rgba(8,8,10,0.98),rgba(19,15,10,0.94)_48%,rgba(8,15,22,0.96))] shadow-2xl shadow-black/40">
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(251,191,36,0.18),transparent_34%),radial-gradient(circle_at_86%_78%,rgba(56,189,248,0.12),transparent_32%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-black/45 shadow-inner shadow-amber-200/5">
                <Image
                  src="/manatap-mini-logo.svg"
                  alt="ManaTap"
                  width={40}
                  height={40}
                  className="h-10 w-10"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">
                  ManaTap mobile
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                  Take ManaTap to game night
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-300 sm:text-base">
                  Build decks, analyze cards, track collections, and get AI-powered MTG help.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px] lg:grid-cols-1">
              <a
                href={CTA_URL}
                onClick={() => trackClicked("app_store_badge")}
                className="group inline-flex transition active:scale-[0.98]"
                aria-label="Download ManaTap on the App Store"
              >
                <AppStoreBadge className="transition group-hover:border-white/35" />
              </a>
              <a
                href={CTA_URL}
                onClick={() => trackClicked("google_play_badge")}
                className="group inline-flex transition active:scale-[0.98]"
                aria-label="Get ManaTap on Google Play"
              >
                <GooglePlayBadge className="transition group-hover:border-white/35" />
              </a>
              <a
                href={CTA_URL}
                onClick={() => trackClicked("primary_button")}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-amber-200/30 bg-amber-300 px-5 py-3 text-sm font-black text-neutral-950 shadow-lg shadow-amber-500/15 transition hover:bg-amber-200 sm:col-span-2 lg:col-span-1"
              >
                Get ManaTap
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
