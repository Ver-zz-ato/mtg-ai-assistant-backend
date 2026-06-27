"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHoverPreview } from "@/components/shared/HoverPreview";
import type { ConstructedDeckResult } from "@/lib/build/collectionConstructedPayload";
import { AI_WORKSHOP_HANDOFF_KEY, type AiWorkshopHandoff } from "@/lib/deck/ai-workshop-actions";

type ConstructedDeckRow = {
  name: string;
  qty: number;
  zone: "mainboard" | "sideboard";
};

interface ConstructedDeckResultModalProps {
  result: ConstructedDeckResult;
  onClose: () => void;
  onBack?: () => void;
  onRegenerate?: () => void;
  onCreateDeck?: (deckText: string) => void | Promise<void>;
  isCreating?: boolean;
  isRegenerating?: boolean;
  requireAuth?: boolean;
  isGuest?: boolean;
}

function normalizeQty(qty: number): number {
  return Math.max(1, Math.floor(Number(qty) || 1));
}

function parseConstructedDeckText(deckText: string): ConstructedDeckRow[] {
  const rows: ConstructedDeckRow[] = [];
  let zone: ConstructedDeckRow["zone"] = "mainboard";

  for (const rawLine of deckText.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^mainboard:?\s*$/i.test(line)) {
      zone = "mainboard";
      continue;
    }
    if (/^sideboard:?\s*$/i.test(line)) {
      zone = "sideboard";
      continue;
    }
    if (/^SB:\s*/i.test(line)) {
      zone = "sideboard";
      line = line.replace(/^SB:\s*/i, "").trim();
    } else if (/^Sideboard:\s*/i.test(line)) {
      zone = "sideboard";
      line = line.replace(/^Sideboard:\s*/i, "").trim();
    }

    const match = line.match(/^\s*(\d+)\s*[xX]?\s+(.+)$/);
    const qty = match ? normalizeQty(Number(match[1])) : 1;
    const name = (match ? match[2] : line).trim();
    if (!name) continue;
    rows.push({ name, qty, zone });
  }

  return rows;
}

function renderConstructedDeckText(rows: ConstructedDeckRow[]): string {
  const main = rows.filter((row) => row.zone === "mainboard");
  const side = rows.filter((row) => row.zone === "sideboard");
  const out = ["Mainboard", ...main.map((row) => `${normalizeQty(row.qty)} ${row.name}`)];
  if (side.length) {
    out.push("", "Sideboard", ...side.map((row) => `${normalizeQty(row.qty)} ${row.name}`));
  }
  return out.join("\n");
}

function zoneCount(rows: ConstructedDeckRow[], zone: ConstructedDeckRow["zone"]): number {
  return rows
    .filter((row) => row.zone === zone)
    .reduce((sum, row) => sum + normalizeQty(row.qty), 0);
}

export default function ConstructedDeckResultModal({
  result,
  onClose,
  onBack,
  onRegenerate,
  onCreateDeck,
  isCreating = false,
  isRegenerating = false,
  requireAuth = false,
  isGuest = false,
}: ConstructedDeckResultModalProps) {
  const router = useRouter();
  const { preview: hoverPreview, bind } = useHoverPreview();
  const [rows, setRows] = useState<ConstructedDeckRow[]>(() => parseConstructedDeckText(result.deckText));
  const [images, setImages] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [copied, setCopied] = useState(false);
  const editedDeckText = useMemo(() => renderConstructedDeckText(rows), [rows]);
  const mainboardCount = zoneCount(rows, "mainboard");
  const sideboardCount = zoneCount(rows, "sideboard");

  useEffect(() => {
    setRows(parseConstructedDeckText(result.deckText));
    setCopied(false);
  }, [result]);

  useEffect(() => {
    const names = Array.from(new Set(rows.map((row) => row.name)));
    if (!names.length) return;
    fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    })
      .then((res) => res.json())
      .then((json) => {
        const next: Record<string, { small?: string; normal?: string }> = {};
        (json?.data || []).forEach((card: { name: string; image_uris?: { small?: string; normal?: string } }) => {
          if (card?.name && card?.image_uris) {
            next[card.name] = {
              small: card.image_uris.small,
              normal: card.image_uris.normal,
            };
          }
        });
        setImages(next);
      })
      .catch(() => {});
  }, [rows]);

  const changeQty = (index: number, delta: number) => {
    if (isCreating || isRegenerating) return;
    setRows((current) =>
      current.flatMap((row, i) => {
        if (i !== index) return [row];
        const nextQty = normalizeQty(row.qty) + delta;
        return nextQty <= 0 ? [] : [{ ...row, qty: nextQty }];
      }),
    );
  };

  const copyDeckText = async () => {
    await navigator.clipboard.writeText(editedDeckText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const openAiWorkshop = () => {
    try {
      const handoff: AiWorkshopHandoff = {
        deckText: editedDeckText,
        format: result.format,
        title: result.title,
        sourceLabel: "Build from collection",
      };
      sessionStorage.setItem(AI_WORKSHOP_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // ignore
    }
    onClose();
    router.push("/ai-workshop");
  };

  const handleCreateDeck = async () => {
    if (!rows.length) return;
    if (requireAuth && isGuest) {
      router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
      onClose();
      return;
    }
    if (onCreateDeck) {
      await onCreateDeck(editedDeckText);
    }
  };

  const renderRow = (row: ConstructedDeckRow, index: number) => {
    const image = images[row.name];
    const imageSrc = image?.normal || image?.small;
    return (
      <div
        key={`${row.zone}-${row.name}-${index}`}
        className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-900/80"
      >
        <div className="h-11 w-8 flex-shrink-0 overflow-hidden rounded bg-neutral-800">
          {imageSrc ? (
            <img
              src={image.small || imageSrc}
              alt={row.name}
              className="h-full w-full object-cover"
              {...(bind(imageSrc) as React.HTMLAttributes<HTMLImageElement>)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[8px] text-neutral-600">
              ...
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => changeQty(index, -1)}
            disabled={isCreating || isRegenerating}
            className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
            aria-label={`Remove one ${row.name}`}
            title={normalizeQty(row.qty) <= 1 ? "Remove row" : "Remove one"}
          >
            -
          </button>
          <span className="w-7 text-center font-mono text-xs text-neutral-300">
            {normalizeQty(row.qty)}
          </span>
          <button
            type="button"
            onClick={() => changeQty(index, 1)}
            disabled={isCreating || isRegenerating}
            className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-50"
            aria-label={`Add one ${row.name}`}
            title="Add one"
          >
            +
          </button>
        </div>
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{row.name}</span>
      </div>
    );
  };

  const indexedRows = rows.map((row, index) => ({ row, index }));
  const mainRows = indexedRows.filter((entry) => entry.row.zone === "mainboard");
  const sideRows = indexedRows.filter((entry) => entry.row.zone === "sideboard");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-neutral-800 p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                Constructed deck preview
              </p>
              <h2 className="text-xl font-bold text-white">{result.title}</h2>
              <p className="mt-1 text-sm text-neutral-400">
                {result.format} / {result.archetype}
                {result.colors?.length ? ` / ${result.colors.join("")}` : ""}
              </p>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
              <p className="text-xs text-neutral-500">Mainboard</p>
              <p className="font-mono text-lg text-white">{mainboardCount}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
              <p className="text-xs text-neutral-500">Sideboard</p>
              <p className="font-mono text-lg text-white">{sideboardCount}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
              <p className="text-xs text-neutral-500">Est. price</p>
              <p className="font-mono text-lg text-white">
                {result.estimatedPriceUsd ? `$${result.estimatedPriceUsd.toFixed(2)}` : "-"}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
              <p className="text-xs text-neutral-500">Confidence</p>
              <p className="font-mono text-lg text-white">{Math.round((result.confidence || 0) * 100)}%</p>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[1.35fr_0.85fr]">
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Mainboard ({mainboardCount})
                </h3>
              </div>
              <div className="space-y-1">
                {mainRows.length ? mainRows.map(({ row, index }) => renderRow(row, index)) : (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-4 text-sm text-neutral-400">
                    No mainboard cards.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Sideboard ({sideboardCount})
              </h3>
              <div className="space-y-1">
                {sideRows.length ? sideRows.map(({ row, index }) => renderRow(row, index)) : (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-4 text-sm text-neutral-400">
                    No sideboard cards.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto border-t border-neutral-800 p-4 md:border-l md:border-t-0">
            {result.explanation?.length ? (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Plan</h3>
                <ul className="space-y-2 text-sm text-neutral-300">
                  {result.explanation.map((line, index) => (
                    <li key={`${line}-${index}`}>- {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.warnings?.length ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Warnings</h3>
                <ul className="space-y-2 text-sm text-amber-100/90">
                  {result.warnings.map((line, index) => (
                    <li key={`${line}-${index}`}>- {line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                No warnings returned.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-neutral-800 p-4 sm:flex-row">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={isCreating || isRegenerating}
              className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              Back
            </button>
          ) : null}
          {onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isCreating || isRegenerating}
              className="rounded-lg border border-purple-500/50 px-4 py-3 text-sm font-semibold text-purple-100 hover:bg-purple-900/30 disabled:opacity-50"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={copyDeckText}
            disabled={!rows.length}
            className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy List"}
          </button>
          <button
            type="button"
            onClick={openAiWorkshop}
            disabled={isCreating || isRegenerating || !rows.length}
            className="rounded-lg border border-violet-500/50 px-4 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-900/30 disabled:opacity-50"
          >
            AI Workshop
          </button>
          {requireAuth && isGuest ? (
            <button
              type="button"
              onClick={() => {
                router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
                onClose();
              }}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500"
            >
              Create account to save deck
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateDeck}
              disabled={isCreating || isRegenerating || !rows.length}
              className="flex-1 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 text-sm font-bold text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Deck"}
            </button>
          )}
        </div>
      </div>
      {hoverPreview}
    </div>
  );
}
