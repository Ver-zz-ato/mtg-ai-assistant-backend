"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { getConsentStatus, setConsentStatus, type ConsentStatus } from "@/lib/consent";
import { useCookieConsentModal } from "./CookieConsentContext";
import { capture } from "@/lib/ph";

/**
 * Centered cookie consent modal
 * 
 * - Blocks interaction until user chooses Accept or Decline
 * - Stores consent in localStorage
 * - Emits events for PostHog initialization
 * - Matches ManaTap dark theme with premium visual polish
 */
export default function CookieConsentModal() {
  const { isOpen, closeModal, openModal } = useCookieConsentModal();
  const [mounted, setMounted] = React.useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const [source, setSource] = React.useState<'modal' | 'privacy_page'>('modal');

  // Only render on client to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for reopen event
  useEffect(() => {
    if (!mounted) return;
    
    const handleReopen = () => {
      setSource('modal');
      openModal();
    };
    
    window.addEventListener('manatap:open-consent-modal', handleReopen);
    return () => {
      window.removeEventListener('manatap:open-consent-modal', handleReopen);
    };
  }, [mounted, openModal]);

  // Focus trap for accessibility
  useEffect(() => {
    if (!isOpen || !mounted) return;

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
  }, [isOpen, mounted]);

  // Prevent body scroll when modal is open
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

  function handleAccept() {
    setConsentStatus("accepted");
    // Track consent choice
    capture('consent_choice', {
      status: 'accepted',
      source: source,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    });
    closeModal();
  }

  function handleDecline() {
    setConsentStatus("declined");
    // Track consent choice
    capture('consent_choice', {
      status: 'declined',
      source: source,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    });
    closeModal();
  }

  // Don't render on server
  if (!mounted || !isOpen) return null;

  return (
    <>
      {/* Backdrop overlay - blocks clicks outside modal */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-md"
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        aria-describedby="cookie-modal-description"
      >
        <div className="relative w-full max-w-md rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 via-neutral-900/80 to-neutral-950 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
          {/* Content */}
          <div className="p-6 md:p-8 space-y-4">
            <h2
              id="cookie-modal-title"
              className="text-xl font-semibold text-white mb-3 tracking-tight"
            >
              Cookies & Analytics
            </h2>
            
            <p
              id="cookie-modal-description"
              className="text-sm text-neutral-300 leading-relaxed"
            >
              We use cookies and analytics to understand how people use ManaTap and to improve AI deck suggestions. You can use the site without optional cookies.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                ref={firstButtonRef}
                onClick={handleDecline}
                className="w-full px-4 py-2 rounded-lg font-medium bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
              >
                Decline
              </button>
              
              <button
                onClick={handleAccept}
                className="w-full px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 hover:from-blue-500 hover:via-violet-500 hover:to-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.5)] text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
              >
                Accept all
              </button>
            </div>

            {/* Privacy policy link */}
            <p className="text-xs text-neutral-500 mt-3">
              You can change your choice anytime in{" "}
              <button 
                onClick={() => {
                  closeModal();
                  setTimeout(() => {
                    openModal();
                  }, 100);
                }}
                className="underline hover:text-neutral-400 transition-colors"
              >
                Cookie Settings
              </button>
              {" "}or read our{" "}
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


