"use client";
/**
 * Ad Helpers - Utilities for managing ads based on Pro status
 * 
 * When ads are added to the application, use these helpers to hide them for Pro users.
 */

import React from "react";
import { useProStatus } from "@/hooks/useProStatus";

/**
 * Hook to determine if ads should be shown
 * @returns true if ads should be shown (user is not Pro), false if ads should be hidden (user is Pro)
 */
export function useShowAds(): boolean {
  const { isPro } = useProStatus();
  return !isPro; // Hide ads for Pro users
}

/**
 * Utility function to check if ads should be shown (for non-React contexts)
 * Note: This is a client-side utility. For server-side checks, use the Pro status from the user session.
 */
export function shouldShowAds(isPro: boolean): boolean {
  return !isPro;
}

/**
 * Component wrapper to conditionally show ads based on Pro status
 * Usage: <AdWrapper><YourAdComponent /></AdWrapper>
 */
export function AdWrapper({ children }: { children: React.ReactNode }) {
  const showAds = useShowAds();
  
  if (!showAds) {
    return null; // Hide ads for Pro users
  }
  
  return <>{children}</>;
}
