"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { getConsentStatus, setConsentStatus } from "@/lib/consent";
import { useCookieConsentModal } from "./CookieConsentContext";
import { capture } from "@/lib/ph";

/**
 * Centered cookie consent modal
 *
 * - Banner: Decline / Manage preferences / Accept all
 * - Preferences: Essential (always on) + Analytics toggle + Save
 * - Stores consent in localStorage
 * - Emits events for PostHog initialization
 */
export default function CookieConsentModal() {
  const { isOpen, mode, closeModal, openPreferences, setMode } = useCookieConsentModal();
  const [mounted, setMounted] = React.useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const [source, setSource] = React.useState<"modal" | "privacy_page" | "preferences">("modal");
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);
  const [cameFromBanner, setCameFromBanner] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCameFromBanner(false);
    }
  }, [isOpen]);

  // Sync analytics toggle when preferences view opens
  useEffect(() => {
    if (!mounted || !isOpen || mode !== "preferences") return;
    const status = getConsentStatus();
    setAnalyticsEnabled(status === "accepted");
  }, [mounted, isOpen, mode]);

  // Listen for reopen event (Cookie Settings elsewhere)
  useEffect(() => {
    if (!mounted) return;

    const handleReopen = () => {
      setSource("preferences");
      openPreferences();
    };

    window.addEventListener("manatap:open-consent-modal", handleReopen);
    return () => {
      window.removeEventListener("manatap:open-consent-modal", handleReopen);
    };
  }, [mounted, openPreferences]);

  // Focus trap for accessibility
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const modal = modalRef.current;
    if (!modal) return;

    firstButtonRef.current?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen, mounted, mode]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  function trackConsentChoice(status: "accepted" | "declined") {
    capture("consent_choice", {
      status,
      source,
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
  }

  function applyConsent(status: "accepted" | "declined") {
    trackConsentChoice(status);
    setConsentStatus(status);
    closeModal();
  }

  function handleAcceptAll() {
    setSource("modal");
    applyConsent("accepted");
  }

  function handleDecline() {
    setSource("modal");
    applyConsent("declined");
  }

  function handleManagePreferences() {
    setSource("preferences");
    setCameFromBanner(true);
    const status = getConsentStatus();
    setAnalyticsEnabled(status === "accepted");
    setMode("preferences");
  }

  function handleSavePreferences() {
    setSource("preferences");
    applyConsent(analyticsEnabled ? "accepted" : "declined");
  }

  if (!mounted || !isOpen) return null;

  const isPreferences = mode === "preferences";

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-md"
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        aria-describedby="cookie-modal-description"
      >
        <div className="relative w-full max-w-md rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 via-neutral-900/80 to-neutral-950 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
          <div className="p-6 md:p-8 space-y-4">
            {isPreferences ? (
              <>
                <h2
                  id="cookie-modal-title"
                  className="text-xl font-semibold text-white mb-1 tracking-tight"
                >
                  Cookie preferences
                </h2>
                <p
                  id="cookie-modal-description"
                  className="text-sm text-neutral-400 leading-relaxed"
                >
                  Choose which optional cookies ManaTap may use. Essential cookies are always active so the site can work.
                </p>

                <div className="space-y-3 pt-1">
                  <div className="rounded-lg border border-neutral-700 bg-neutral-900/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">Essential cookies</div>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Required for sign-in, security, and saving your preferences. Always on.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-neutral-600 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                        Always on
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-neutral-700 bg-neutral-900/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">Analytics cookies</div>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Optional usage analytics to help us understand how players use ManaTap and improve AI-powered features.
                        </p>
                      </div>
                      <label className="relative inline-flex shrink-0 items-center cursor-pointer mt-0.5">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={analyticsEnabled}
                          onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                        />
                        <div
                          className={`w-11 h-6 rounded-full transition-colors ${
                            analyticsEnabled ? "bg-emerald-600" : "bg-neutral-600"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                              analyticsEnabled ? "translate-x-5" : "translate-x-0.5"
                            } mt-0.5`}
                          />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {cameFromBanner && (
                    <button
                      type="button"
                      onClick={() => setMode("banner")}
                      className="w-full px-4 py-2 rounded-lg font-medium bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                    >
                      Back
                    </button>
                  )}
                  <button
                    ref={firstButtonRef}
                    type="button"
                    onClick={handleSavePreferences}
                    className="w-full px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 hover:from-blue-500 hover:via-violet-500 hover:to-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.5)] text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                  >
                    Save preferences
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2
                  id="cookie-modal-title"
                  className="text-xl font-semibold text-white mb-3 tracking-tight"
                >
                  Your Privacy Choices
                </h2>

                <div
                  id="cookie-modal-description"
                  className="text-sm text-neutral-300 leading-relaxed space-y-2"
                >
                  <p>We use essential cookies to keep ManaTap working.</p>
                  <p>
                    Optional analytics help us understand how players use the site and improve AI-powered features.
                  </p>
                  <p>You can accept or decline optional cookies at any time.</p>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    ref={firstButtonRef}
                    type="button"
                    onClick={handleAcceptAll}
                    className="w-full px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 hover:from-blue-500 hover:via-violet-500 hover:to-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.5)] text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                  >
                    Accept all
                  </button>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={handleDecline}
                      className="w-full px-4 py-2 rounded-lg font-medium bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={handleManagePreferences}
                      className="w-full px-4 py-2 rounded-lg font-medium bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                    >
                      Manage preferences
                    </button>
                  </div>
                </div>
              </>
            )}

            <p className="text-xs text-neutral-500 mt-3">
              You can change your choice anytime in{" "}
              <button
                type="button"
                onClick={() => {
                  setSource("preferences");
                  openPreferences();
                }}
                className="underline hover:text-neutral-400 transition-colors"
              >
                Cookie Settings
              </button>{" "}
              or read our{" "}
              <Link
                href="/privacy"
                className="underline hover:text-neutral-400 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
