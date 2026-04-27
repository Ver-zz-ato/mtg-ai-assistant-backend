"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normResponse(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const tryArr = (a: unknown): string[] =>
    Array.isArray(a)
      ? a
          .map((r) => (typeof r === "string" ? r : (r as { name?: string })?.name))
          .filter((x): x is string => !!x)
      : [];
  if (Array.isArray(o.cards)) return tryArr(o.cards);
  if (o.data && typeof o.data === "object" && o.data !== null) {
    const d = o.data as Record<string, unknown>;
    if (Array.isArray(d.items)) return tryArr(d.items);
    if (Array.isArray(d)) return tryArr(d);
  }
  if (Array.isArray(o.items)) return tryArr(o.items);
  return [];
}

type Pending = { name: string; fromSuggestion: boolean };

/**
 * Deck editor: **add** cards from cached `/api/cards/search` results.
 * Picking a name opens a small confirm dialog; on confirm, `onAdd` runs (see `CardsPane` for 5s undo).
 */
export default function EditorAddBar({
  onAdd,
  placeholder = "Search to add a card…",
  /** For 60-card formats: new cards are stored in this zone. Commander uses mainboard. */
  addTargetZone = "mainboard",
}: {
  onAdd: (
    name: string,
    qty: number,
    validatedName?: string,
    zone?: "mainboard" | "sideboard"
  ) => void | Promise<void>;
  placeholder?: string;
  addTargetZone?: "mainboard" | "sideboard";
}) {
  const [value, setValue] = useState("");
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const latestQ = useRef("");

  const term = value.trim();
  const debounced = useDebounced(term, 180);

  useEffect(() => {
    let aborted = false;
    if (!debounced) {
      setItems([]);
      setOpen(false);
      return;
    }
    setOpen(true);
    (async () => {
      setLoading(true);
      try {
        latestQ.current = debounced;
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(debounced)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (aborted || latestQ.current !== debounced) return;
        const list = normResponse(json);
        setItems(list.slice(0, 12));
        const exact = list.some((n) => n.toLowerCase() === debounced.toLowerCase());
        setOpen(list.length > 0 && !exact);
        setHi(0);
      } catch {
        if (!aborted) {
          setItems([]);
          setOpen(false);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [debounced]);

  const [ddPos, setDdPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const updatePos = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDdPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setDdPos(null);
      return;
    }
    updatePos();
    const w = () => updatePos();
    window.addEventListener("scroll", w, true);
    window.addEventListener("resize", w);
    try {
      window.visualViewport?.addEventListener("resize", w);
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener("scroll", w, true);
      window.removeEventListener("resize", w);
      try {
        window.visualViewport?.removeEventListener("resize", w);
      } catch {
        /* ignore */
      }
    };
  }, [open, updatePos, items.length, loading, debounced, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  function startConfirm(name: string, fromSuggestion: boolean) {
    const n = name.trim();
    if (!n) return;
    setOpen(false);
    setPending({ name: n, fromSuggestion });
  }

  async function commitAdd() {
    if (!pending) return;
    const n = pending.name;
    const q = Math.max(1, Number(qty) || 1);
    const validated = pending.fromSuggestion ? n : undefined;
    setPending(null);
    setValue("");
    setQty(1);
    setItems([]);
    await onAdd(n, q, validated, addTargetZone);
  }

  const canMainAdd = term.length > 0 && (Number(qty) || 0) > 0;

  const suggestionList =
    open &&
    typeof document !== "undefined" &&
    ddPos &&
    createPortal(
      <div
        ref={listRef}
        className="max-h-56 overflow-auto rounded border border-neutral-600 bg-neutral-900 shadow-2xl"
        style={{
          position: "fixed",
          zIndex: 50000,
          top: ddPos.top,
          left: ddPos.left,
          width: Math.min(ddPos.width, typeof window !== "undefined" ? window.innerWidth - 16 : ddPos.width),
          maxWidth: "calc(100vw - 16px)",
        }}
      >
        {loading && <div className="px-3 py-2 text-sm text-neutral-400">Searching…</div>}
        {!loading &&
          items.map((name, i) => (
            <button
              key={`${name}-${i}`}
              type="button"
              className={`block w-full cursor-pointer px-3 py-2.5 text-left text-sm ${
                hi === i ? "bg-emerald-900/50 text-white" : "text-neutral-200 hover:bg-neutral-800"
              }`}
              onMouseEnter={() => setHi(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                startConfirm(name, true);
              }}
            >
              {name}
            </button>
          ))}
        {!loading && items.length === 0 && (
          <div className="px-3 py-2 text-sm text-neutral-500">No matches in cache / search</div>
        )}
      </div>,
      document.body
    );

  const confirmModal =
    pending &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[50001] flex items-end justify-center bg-black/70 p-4 sm:items-center"
        onClick={() => setPending(null)}
        role="presentation"
      >
        <div
          className="w-full max-w-sm rounded-lg border border-neutral-600 bg-neutral-950 p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-card-confirm-title"
        >
          <h2 id="add-card-confirm-title" className="text-sm font-semibold text-white">
            Add to deck?
          </h2>
          <p className="mt-1 text-xs text-amber-200/80">
            {addTargetZone === "sideboard" ? "Sideboard" : "Main deck"}
          </p>
          <p className="mt-2 text-sm text-neutral-200">
            Add <span className="font-medium text-white">{pending.name}</span>
            {qty > 1 ? ` ×${qty}` : ""}?
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            You can undo for a few seconds after it&apos;s added.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              onClick={() => void commitAdd()}
            >
              Add card
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div ref={boxRef} className="space-y-1">
      <div className="text-xs font-medium text-neutral-400">Add card</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (open && items.length > 0) {
                  const pick = items[hi];
                  if (pick) startConfirm(pick, true);
                } else if (canMainAdd) {
                  startConfirm(value.trim(), false);
                }
              } else if (e.key === "ArrowDown" && open && items.length) {
                e.preventDefault();
                setHi((i) => (i + 1) % items.length);
              } else if (e.key === "ArrowUp" && open && items.length) {
                e.preventDefault();
                setHi((i) => (i - 1 + items.length) % items.length);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            onFocus={() => term && items.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full rounded border border-neutral-700 bg-black/40 px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="editor-add-qty">
            Quantity
          </label>
          <input
            id="editor-add-qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded border border-neutral-700 bg-black/40 px-2 py-2 text-center text-sm"
          />
          <button
            type="button"
            onClick={() => canMainAdd && startConfirm(value.trim(), false)}
            disabled={!canMainAdd}
            className="rounded border border-emerald-700/50 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-800/40 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
      {suggestionList}
      {confirmModal}
    </div>
  );
}

function useDebounced<T>(v: T, ms: number) {
  const [x, setX] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return x;
}
