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
      <span aria-hidden="true">Discord</span>
      <span>Feedback? Join our Discord</span>
    </a>
  );
}
