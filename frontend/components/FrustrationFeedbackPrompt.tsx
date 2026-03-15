"use client";

import React from "react";

const SESSION_KEY = "feedback_prompt_shown_session";
const OPEN_FEEDBACK_EVENT = "manatap:open_feedback";

export default function FrustrationFeedbackPrompt() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const onFrustration = () => {
      try {
        if (sessionStorage.getItem(SESSION_KEY) === "true") return;
        const el = document.activeElement as HTMLElement | null;
        if (el?.matches?.("input, textarea, [contenteditable=true]")) return;

        sessionStorage.setItem(SESSION_KEY, "true");

        import("@/lib/ph").then(({ capture }) => {
          capture("feedback_prompt_shown", { source: "frustration" });
        }).catch(() => {});

        import("@/lib/toast-client").then(({ toastPanel }) => {
          toastPanel({
            title: "Something not working?",
            type: "info",
            actions: [
              {
                label: "Send feedback",
                variant: "primary",
                onClick: () => {
                  window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT, { detail: { trigger: "frustration_prompt" } }));
                },
              },
            ],
            autoCloseMs: 15000,
          });
        }).catch(() => {});
      } catch {
        // fail-open
      }
    };

    window.addEventListener("manatap:frustration_detected", onFrustration);
    return () => window.removeEventListener("manatap:frustration_detected", onFrustration);
  }, []);

  return null;
}
