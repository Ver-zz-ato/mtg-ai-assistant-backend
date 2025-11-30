"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { getConsentStatus, setConsentStatus, type ConsentStatus } from "@/lib/consent";

/**
 * Centered cookie consent modal
 * 
 * - Blocks interaction until user chooses Accept or Decline
 * - Stores consent in localStorage
 * - Emits events for PostHog initialization
 * - Matches ManaTap dark theme
 */
export default function CookieConsentModal() {
  const [visible, setVisible] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Only render on client to avoid hydration issues
  useEffect(() => {
    setMounted(true);
    const status = getConsentStatus();
    setVisible(status === "unknown");
  }, []);

  // Focus trap for accessibility
  useEffect(() => {
    if (!visible || !mounted) return;

    const modal = modalRef.current;
    if (!modal) return;

    // Focus first button when modal opens
    firstButtonRef.current?.focus();

    // Trap focus within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [visible, mounted]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  function handleAccept() {
    setConsentStatus("accepted");
    setVisible(false);
  }

  function handleDecline() {
    setConsentStatus("declined");
    setVisible(false);
  }

  // Don't render on server
  if (!mounted || !visible) return null;

  return (
    <>
      {/* Backdrop overlay - blocks clicks outside modal */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        aria-describedby="cookie-modal-description"
      >
        <div className="relative w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
          {/* Content */}
          <div className="p-6 space-y-4">
            <h2
              id="cookie-modal-title"
              className="text-2xl font-bold text-white"
            >
              Cookies & Analytics
            </h2>
            
            <p
              id="cookie-modal-description"
              className="text-neutral-300 text-sm leading-relaxed"
            >
              We use cookies and analytics to understand how people use ManaTap and to improve AI deck suggestions. You can use the site without optional cookies.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                ref={firstButtonRef}
                onClick={handleAccept}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
              >
                Accept all
              </button>
              
              <button
                onClick={handleDecline}
                className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-200 font-medium hover:bg-neutral-700 hover:border-neutral-500 transition-all focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
              >
                Decline
              </button>
            </div>

            {/* Learn more link */}
            <div className="pt-2 text-center">
              <Link
                href="/privacy"
                className="text-xs text-neutral-400 hover:text-neutral-300 underline transition-colors"
                onClick={(e) => {
                  // Don't close modal when clicking learn more
                  e.stopPropagation();
                }}
              >
                Learn more about our privacy practices
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Hook to programmatically reopen the consent modal
 * Useful for "Cookie settings" links in footer
 */
export function useCookieConsentModal() {
  const [forceShow, setForceShow] = React.useState(false);

  const openModal = React.useCallback(() => {
    // Clear consent to force modal to show
    const { clearConsentStatus } = require("@/lib/consent");
    clearConsentStatus();
    setForceShow(true);
  }, []);

  return { openModal, forceShow };
}

