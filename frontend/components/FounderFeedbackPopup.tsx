"use client";

import React from "react";

const STORAGE_KEY = "founder_popup_seen";
const OPEN_FEEDBACK_EVENT = "manatap:open_feedback";
const DECK_ANALYSIS_COMPLETE_EVENT = "manatap:deck_analysis_complete";
const DELAY_MS = 45 * 1000;

export default function FounderFeedbackPopup() {
  const [show, setShow] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const maybeShow = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === "true") return;
        localStorage.setItem(STORAGE_KEY, "true");
        setShow(true);
        import("@/lib/ph").then(({ capture }) => {
          capture("founder_popup_shown");
        }).catch(() => {});
      } catch {
        // fail-open
      }
    };

    const timer = setTimeout(maybeShow, DELAY_MS);

    const onAnalysisComplete = () => {
      clearTimeout(timer);
      try {
        if (localStorage.getItem(STORAGE_KEY) === "true") return;
        localStorage.setItem(STORAGE_KEY, "true");
        setShow(true);
        import("@/lib/ph").then(({ capture }) => {
          capture("founder_popup_shown");
        }).catch(() => {});
      } catch {
        // fail-open
      }
    };

    window.addEventListener(DECK_ANALYSIS_COMPLETE_EVENT, onAnalysisComplete);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DECK_ANALYSIS_COMPLETE_EVENT, onAnalysisComplete);
    };
  }, [mounted]);

  const handleSendFeedback = () => {
    try {
      import("@/lib/ph").then(({ capture }) => {
        capture("founder_popup_cta_clicked");
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT, { detail: { trigger: "founder_popup" } }));
    } catch {}
    setShow(false);
  };

  const handleMaybeLater = () => {
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl text-neutral-200">
        <p className="text-sm font-medium mb-2">
          Hey — I&apos;m the developer of ManaTap.
        </p>
        <p className="text-sm text-neutral-300 mb-4">
          If anything feels confusing, wrong, or missing, I&apos;d genuinely love to hear it.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleMaybeLater}
            className="px-3 py-2 rounded-lg border border-neutral-600 hover:bg-neutral-800 text-sm"
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={handleSendFeedback}
            className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-black font-medium text-sm"
          >
            Send feedback
          </button>
        </div>
      </div>
    </div>
  );
}
