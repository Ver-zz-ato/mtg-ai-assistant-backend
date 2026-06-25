"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { APP_STORE_URLS } from "@/lib/home/homeConfig";
import { useHomeMobilePlatform, type HomeMobilePlatform } from "@/lib/home/useHomeMobilePlatform";
import { capture } from "@/lib/ph";
import AppScreenshotCarousel from "@/components/mobile/AppScreenshotCarousel";
import { AppStoreBadge, GooglePlayBadge } from "@/components/mobile/mobileStoreIcons";

const DISMISS_KEY = "mtg:mobile_app_install_banner:dismissed_until";
const DISMISS_DAYS = 30;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

function isExcludedPath(pathname: string): boolean {
  if (!pathname) return true;
  // Public site only (no admin/internal surfaces).
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/dashboard")
  );
}

function storeUrlForPlatform(platform: HomeMobilePlatform): string {
  if (platform === "ios") return APP_STORE_URLS.ios;
  if (platform === "android") return APP_STORE_URLS.android;
  return "/get";
}

function parseDismissedUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setDismissedUntil(ts: number): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(ts));
  } catch {
    // ignore
  }
}

export default function MobileAppInstallStickyBanner() {
  const pathname = usePathname() || "/";
  const { ready, isMobile, platform } = useHomeMobilePlatform();

  const [dismissed, setDismissed] = useState<boolean>(true);
  const viewedRef = useRef(false);

  const excluded = useMemo(() => isExcludedPath(pathname), [pathname]);
  const destinationUrl = useMemo(() => storeUrlForPlatform(platform), [platform]);
  const isDesktopVisitor = ready && !isMobile;

  useEffect(() => {
    if (!ready) return;
    if (excluded) {
      setDismissed(true);
      return;
    }

    const until = parseDismissedUntil();
    const isDismissed = typeof until === "number" && until > Date.now();
    setDismissed(isDismissed);
  }, [ready, excluded]);

  const shouldRender = ready && !excluded && !dismissed;

  useEffect(() => {
    if (!shouldRender) return;
    if (viewedRef.current) return;
    viewedRef.current = true;

    capture("app_install_banner_viewed", {
      source: "mobile_web_sticky_banner",
      pathname,
      platform_detected: platform,
      placement: "sticky_bottom",
      release_context: "ios_android_public_launch",
    });
  }, [shouldRender, pathname, platform]);

  if (!shouldRender) return null;

  const onDismiss = () => {
    setDismissedUntil(Date.now() + DISMISS_MS);
    setDismissed(true);
    capture("app_install_banner_dismissed", {
      source: "mobile_web_sticky_banner",
      pathname,
      platform_detected: platform,
      placement: "sticky_bottom",
      release_context: "ios_android_public_launch",
      days_dismissed: DISMISS_DAYS,
    });
  };

  const onStoreClick = (url: string = destinationUrl, targetPlatform: HomeMobilePlatform = platform) => {
    capture("app_install_banner_clicked", {
      source: "mobile_web_sticky_banner",
      pathname,
      platform_detected: targetPlatform,
      placement: "sticky_bottom",
      release_context: "ios_android_public_launch",
      destination_url: url,
    });
    window.location.href = url;
  };

  const onGetPageClick = () => {
    capture("app_install_banner_clicked", {
      source: "mobile_web_sticky_banner",
      pathname,
      platform_detected: platform,
      placement: "sticky_bottom_screenshot",
      release_context: "ios_android_public_launch",
      destination_url: "/get",
    });
    window.location.href = "/get";
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      role="region"
      aria-label="Install ManaTap app"
    >
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(10,10,12,0.96),rgba(16,13,10,0.92))] shadow-[0_-10px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] lg:max-w-5xl">
        <div className="flex items-start gap-4 p-3.5 lg:gap-5 lg:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300 lg:text-xs">
                  ManaTap mobile
                </p>
                <div className="mt-1 text-sm font-black text-white lg:text-lg">
                  Get the full ManaTap experience on your phone
                </div>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-200 transition hover:bg-white/10"
                aria-label="Dismiss app install banner"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 text-xs leading-5 text-neutral-300 lg:text-sm lg:leading-6">
              Deck tools, scans, collections, life counter, tournaments and AI help in your pocket - on iOS
              and Android.
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 lg:mt-4 lg:gap-3">
              {platform === "other" ? (
                <>
                  <button
                    type="button"
                    onClick={() => onStoreClick(APP_STORE_URLS.ios, "ios")}
                    className="group inline-flex flex-1 transition active:scale-[0.98]"
                    aria-label="Download ManaTap on the App Store"
                  >
                    <AppStoreBadge className="transition group-hover:border-white/35" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStoreClick(APP_STORE_URLS.android, "android")}
                    className="group inline-flex flex-1 transition active:scale-[0.98]"
                    aria-label="Get ManaTap on Google Play"
                  >
                    <GooglePlayBadge className="transition group-hover:border-white/35" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onStoreClick()}
                  className="group inline-flex flex-1 transition active:scale-[0.98]"
                  aria-label={platform === "ios" ? "Download ManaTap on the App Store" : "Get ManaTap on Google Play"}
                >
                  {platform === "ios" ? (
                    <AppStoreBadge className="transition group-hover:border-white/35" />
                  ) : (
                    <GooglePlayBadge className="transition group-hover:border-white/35" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-white/10 lg:min-h-[52px] lg:px-5 lg:text-base"
              >
                Not now
              </button>
            </div>
          </div>
          {isDesktopVisitor ? (
            <button
              type="button"
              onClick={onGetPageClick}
              className="hidden shrink-0 items-center gap-3 rounded-2xl border border-amber-200/20 bg-white/[0.03] p-2.5 transition hover:border-amber-200/35 hover:bg-white/[0.06] lg:flex"
              aria-label="Open ManaTap app download page"
            >
              <AppScreenshotCarousel className="w-24" frameClassName="rounded-xl border-white/10 shadow-none" sizes="96px" />
              <span className="rounded-xl bg-white p-1.5 shadow-lg shadow-black/25">
                <Image
                  src="/app-screenshots/manatap-get-qr-with-logo.png"
                  alt="QR code for the ManaTap app download page"
                  width={112}
                  height={112}
                  className="h-28 w-28"
                  sizes="112px"
                />
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
