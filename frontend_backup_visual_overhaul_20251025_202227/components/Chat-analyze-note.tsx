"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Msg = { id: string; role: "user" | "assistant" | "system"; content: string; created_at?: string };
type Thread = { id: string; title: string; created_at?: string; deck_id?: string | null };

function looksDecklist(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  let hits = 0;
  for (const l of lines) {
    if (/^\d+\s*x?\s+/i.test(l)) hits++;
    else if (/^\*\s+/.test(l)) hits++;
    else if (/^\-\s+/.test(l)) hits++;
    else if (/^\[\[.+\]\]$/.test(l)) hits++;
    else if (/^sideboard\b/i.test(l)) hits++;
  }
  return hits >= 8;
}

export default function ChatPatchedAnalyze({ onSend }: { onSend?: () => void }) {
  // This file is meant to replace the existing Chat.tsx content's send() logic.
  // Integrators: copy the looksDecklist() and send() override into your current Chat.tsx.
  return null;
}
