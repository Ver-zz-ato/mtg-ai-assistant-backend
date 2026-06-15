"use client";

import { useEffect, useState } from "react";

export type HomeMobilePlatform = "ios" | "android" | "other";

type HomeMobileState = {
  ready: boolean;
  isMobile: boolean;
  platform: HomeMobilePlatform;
};

function detectPlatform(): HomeMobilePlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (
    /\b(iphone|ipad|ipod)\b/.test(ua) ||
    (/\bmacintosh\b/.test(ua) && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  if (/\bandroid\b/.test(ua)) return "android";
  return "other";
}

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return true;
  return window.matchMedia("(max-width: 767px)").matches;
}

/** Client-only mobile / platform detection for homepage install banner */
export function useHomeMobilePlatform(): HomeMobileState {
  const [state, setState] = useState<HomeMobileState>({
    ready: false,
    isMobile: false,
    platform: "other",
  });

  useEffect(() => {
    const update = () => {
      setState({
        ready: true,
        isMobile: detectMobile(),
        platform: detectPlatform(),
      });
    };
    update();
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => update();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return state;
}
