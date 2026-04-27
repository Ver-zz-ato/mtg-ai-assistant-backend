"use client";

import React from "react";
import { getCopyCountViolations, isCommanderFormatString } from "@/lib/deck/formatRules";

type Row = { name: string; qty: number; zone?: string | null };

type Props = { deckId: string; format?: string | null };

/**
 * 60-card formats: warn when a non-basic card has more than 4 copies in the mainboard (+ commander zone).
 * Commander: handled by SingletonViolationBanner — this returns null.
 */
export default function CopyCountWarningBanner({ deckId, format }: Props) {
  const [checking, setChecking] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);
  const [messages, setMessages] = React.useState<string[]>([]);

  const isRelevant = format && !isCommanderFormatString(format);

  React.useEffect(() => {
    if (!isRelevant) {
      setChecking(false);
      return;
    }
    let mounted = true;

    async function run() {
      try {
        setChecking(true);
        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            setMessages([]);
            setChecking(false);
          }
          return;
        }
        const data = await res.json().catch(() => ({ ok: false }));
        if (!mounted || !data?.ok) {
          if (mounted) {
            setMessages([]);
            setChecking(false);
          }
          return;
        }
        const cards = (Array.isArray(data.cards) ? data.cards : []) as Row[];
        const mainRows = cards
          .filter((c) => String(c.zone || "mainboard").toLowerCase() !== "sideboard")
          .map((c) => ({ name: c.name, qty: c.qty }));
        const violations = getCopyCountViolations(mainRows, format!);
        const msgs = violations.map(
          (v) =>
            `Too many copies for this format: ${v.name} has ${v.qty} copies. Most non-basic cards are limited to 4.`
        );
        if (mounted) setMessages(msgs);
      } catch {
        if (mounted) setMessages([]);
      } finally {
        if (mounted) setChecking(false);
      }
    }

    const t = setTimeout(() => void run(), 500);
    const onDeckChange = () => {
      if (mounted) {
        setDismissed(false);
        void run();
      }
    };
    window.addEventListener("deck:changed", onDeckChange);
    return () => {
      mounted = false;
      clearTimeout(t);
      window.removeEventListener("deck:changed", onDeckChange);
    };
  }, [deckId, format, isRelevant]);

  if (!isRelevant || checking || dismissed || messages.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-500/50 bg-gradient-to-r from-amber-900/30 to-yellow-900/20 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="text-2xl flex-shrink-0">📑</div>
          <div className="min-w-0">
            <div className="font-semibold text-amber-200 mb-1">Copy limit</div>
            <ul className="text-sm text-amber-100/90 list-disc pl-4 space-y-1">
              {messages.slice(0, 8).map((m) => (
                <li key={m} className="break-words">
                  {m}
                </li>
              ))}
            </ul>
            {messages.length > 8 && (
              <p className="text-xs text-amber-200/70 mt-1">…and {messages.length - 8} more</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="px-3 py-2 rounded-lg border border-amber-500/50 hover:bg-amber-900/30 text-amber-200 text-sm font-medium flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
