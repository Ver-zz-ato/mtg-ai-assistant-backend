"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { APP_STORE_URLS } from "@/lib/home/homeConfig";
import { useHomeMobilePlatform, type HomeMobilePlatform } from "@/lib/home/useHomeMobilePlatform";
import { capture } from "@/lib/ph";

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

  useEffect(() => {
    if (!ready) return;
    if (!isMobile || excluded) {
      setDismissed(true);
      return;
    }

    const until = parseDismissedUntil();
    const isDismissed = typeof until === "number" && until > Date.now();
    setDismissed(isDismissed);
  }, [ready, isMobile, excluded]);

  const shouldRender = ready && isMobile && !excluded && !dismissed;

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

  const onClick = () => {
    capture("app_install_banner_clicked", {
      source: "mobile_web_sticky_banner",
      pathname,
      platform_detected: platform,
      placement: "sticky_bottom",
      release_context: "ios_android_public_launch",
      destination_url: destinationUrl,
    });
    window.location.href = destinationUrl;
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      role="region"
      aria-label="Install ManaTap app"
    >
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(10,10,12,0.96),rgba(16,13,10,0.92))] shadow-[0_-10px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-start gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-black text-white">ManaTap is now on mobile</div>
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-200 transition hover:bg-white/10"
                aria-label="Dismiss app install banner"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 text-xs leading-5 text-neutral-300">
              Build, analyse and manage your MTG decks on iPhone and Android.
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClick}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-400/15"
              >
                Get the app
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-white/10"
              >
                Not now
              </button>
            </div>
            {platform === "other" ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                <a className="underline underline-offset-2 hover:text-neutral-200" href={APP_STORE_URLS.ios}>
                  App Store
                </a>
                <span className="opacity-60">·</span>
                <a className="underline underline-offset-2 hover:text-neutral-200" href={APP_STORE_URLS.android}>
                  Google Play
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

