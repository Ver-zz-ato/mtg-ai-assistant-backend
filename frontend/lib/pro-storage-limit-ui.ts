"use client";

import {
  FREE_COLLECTION_CARD_LIMIT,
  PRO_STORAGE_LIMIT_MESSAGES,
  type ProStorageLimitCode,
} from "@/lib/pro-storage-limits";
import { toastPanel } from "@/lib/toast-client";

type ProLimitPayload = {
  code?: unknown;
  error?: unknown;
  limit?: unknown;
};

function parseProLimitCode(payload: ProLimitPayload): ProStorageLimitCode | null {
  if (typeof payload?.code === "string" && payload.code.startsWith("PRO_LIMIT_")) {
    return payload.code as ProStorageLimitCode;
  }
  if (typeof payload?.error === "string") {
    const match = payload.error.match(/PRO_LIMIT_[A-Z_]+/);
    if (match) return match[0] as ProStorageLimitCode;
  }
  return null;
}

function cleanProLimitMessage(payload: ProLimitPayload, code: ProStorageLimitCode | null): string {
  if (code && PRO_STORAGE_LIMIT_MESSAGES[code]) {
    return PRO_STORAGE_LIMIT_MESSAGES[code];
  }
  const raw = typeof payload.error === "string" ? payload.error.trim() : "";
  const stripped = raw.replace(/^PRO_LIMIT_[A-Z_]+:\s*/i, "").trim();
  return stripped || "Upgrade to Pro for unlimited ManaTap storage.";
}

const PRO_SELL_LINE =
  "Pro unlocks unlimited collection size, unlimited collections, higher AI limits, and more — from £1.99/month.";

export function isProStorageLimitPayload(payload: ProLimitPayload | null | undefined): boolean {
  return (
    (typeof payload?.code === "string" && payload.code.startsWith("PRO_LIMIT_")) ||
    (typeof payload?.error === "string" && payload.error.includes("PRO_LIMIT_"))
  );
}

export type ProStorageLimitPanelContext = {
  attempted?: number;
  current?: number;
  importMode?: "merge" | "overwrite";
};

export function showProStorageLimitPanel(
  payload: ProLimitPayload,
  context?: ProStorageLimitPanelContext,
): void {
  const code = parseProLimitCode(payload);
  const message = cleanProLimitMessage(payload, code);
  const limit =
    typeof payload.limit === "number"
      ? payload.limit
      : code === "PRO_LIMIT_COLLECTION_SIZE"
        ? FREE_COLLECTION_CARD_LIMIT
        : undefined;

  const lines: Array<{ text: string }> = [{ text: message }];

  if (code === "PRO_LIMIT_COLLECTION_SIZE" && context?.attempted != null) {
    const modeNote =
      context.importMode === "overwrite"
        ? "Overwrite mode replaces your collection with the import."
        : context.current
          ? `Your collection already has ${context.current} cards.`
          : "This is a new collection.";
    const cap = limit ?? FREE_COLLECTION_CARD_LIMIT;
    const importable =
      context.importMode === "overwrite"
        ? cap
        : Math.max(0, cap - (context.current ?? 0));
    lines.push({
      text: `${modeNote} This import has ${context.attempted} cards, but free collections hold up to ${cap} cards.${
        importable > 0
          ? ` You can import the first ${importable} now, or upgrade to Pro for the full list.`
          : " Upgrade to Pro to add more cards."
      }`,
    });
  }

  lines.push({ text: PRO_SELL_LINE });

  toastPanel({
    title: "Free plan limit reached",
    type: "info",
    large: true,
    autoCloseMs: 20000,
    lines,
    actions: [
      {
        label: "View Pro pricing",
        variant: "primary",
        onClick: () => {
          window.location.href = "/pricing";
        },
      },
    ],
  });
}

export async function showProStorageLimitToast(payload: ProLimitPayload): Promise<void> {
  showProStorageLimitPanel(payload);
}

export async function handleProStorageLimitPayload(
  payload: ProLimitPayload,
  context?: ProStorageLimitPanelContext,
): Promise<boolean> {
  if (!isProStorageLimitPayload(payload)) return false;
  showProStorageLimitPanel(payload, context);
  return true;
}
