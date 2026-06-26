// components/FeedbackFab.tsx
"use client";

import React from "react";
import { capture } from "@/lib/ph";
import { MANATAP_DISCORD_INVITE_URL } from "@/lib/manatap-links";

const OPEN_FEEDBACK_EVENT = "manatap:open_feedback";

export default function FeedbackFab() {
  React.useEffect(() => {
    const onOpen = () => {
      try { capture("discord_join_clicked", { location: "feedback_fab_event" }); } catch {}
      window.open(MANATAP_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  return (
    <a
      href={MANATAP_DISCORD_INVITE_URL}
      target="_blank"
      rel="noreferrer"
      onClick={() => { try { capture("discord_join_clicked", { location: "feedback_fab" }); } catch {} }}
      className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-950/90 px-4 py-2 text-sm font-semibold text-indigo-100 shadow-lg hover:bg-indigo-900"
      aria-label="Feedback? Join our Discord"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M19.2 5.3A15.5 15.5 0 0 0 15.4 4l-.2.4c1.4.4 2.1 1 2.1 1s-1.8-1-5.3-1-5.3 1-5.3 1 .7-.6 2.1-1L8.6 4a15.5 15.5 0 0 0-3.8 1.3C2.4 9 1.8 12.6 2.1 16.1A15.3 15.3 0 0 0 6.7 18.4l.9-1.2a6.1 6.1 0 0 1-1.5-.7l.4-.3c2.9 1.3 6.1 1.3 9 0l.4.3a6.1 6.1 0 0 1-1.5.7l.9 1.2a15.3 15.3 0 0 0 4.6-2.3c.4-4-.7-7.5-2.7-10.8ZM8.6 14.2c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm6.8 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z" />
      </svg>
      <span>Feedback? Join our Discord</span>
    </a>
  );
}
