"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Suggestion = { name: string };

export default function EditorAddBar({
  onAdd,
  placeholder = "Search card...",
}: {
  onAdd: (name: string, qty: number, validatedName?: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the search term
  const term = value.trim();
  const debounced = useDebounced(term, 180);

  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!debounced) {
        setItems([]);
        setOpen(false);
        return;
      }
      try {
        setLoading(true);
        // shape can be { data: { items } } or { cards: [...] } — normalize to [{name}]
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(debounced)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (aborted) return;

        const raw: any[] =
          json?.data?.items ??
          json?.data ??
          json?.cards ??
          json?.items ??
          [];

        const mapped: Suggestion[] = raw
          .map((r) => (typeof r === "string" ? { name: r } : { name: r?.name }))
          .filter((r) => !!r.name);

        setItems(mapped.slice(0, 12));
        setOpen(mapped.length > 0);
      } catch {
        if (!aborted) {
          setItems([]);
          setOpen(false);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [debounced]);

  // Close the popover if clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const canSubmit = useMemo(() => term.length > 0 && (Number(qty) || 0) > 0, [term, qty]);

  const [selectedFromDropdown, setSelectedFromDropdown] = useState(false);

  function pick(name: string) {
    setValue(name);
    setOpen(false);
    setSelectedFromDropdown(true); // Mark that this name came from dropdown
    // keep focus in the input for quick Enter to add
    inputRef.current?.focus();
  }

  async function submit() {
    const n = value.trim();
    const q = Math.max(1, Number(qty) || 1);
    if (!n) return;
    // If name was selected from dropdown, pass it as validatedName to skip validation
    const wasSelected = selectedFromDropdown;
    setSelectedFromDropdown(false); // Reset flag
    await onAdd(n, q, wasSelected ? n : undefined);
    // clear only after onAdd completes successfully
    setValue("");
    setQty(1);
    setItems([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div ref={boxRef} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSelectedFromDropdown(false); // Reset flag when user types
          }}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full rounded border border-neutral-700 bg-black/40 px-3 py-1 outline-none"
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-neutral-700 bg-neutral-900 shadow-lg">
            {items.map((it) => (
              <button
                key={it.name}
                type="button"
                onClick={() => pick(it.name)}
                className="block w-full cursor-pointer px-3 py-1 text-left hover:bg-neutral-800"
              >
                {it.name}
              </button>
            ))}
            {loading && <div className="px-3 py-1 text-sm opacity-70">Searching…</div>}
            {!loading && items.length === 0 && (
              <div className="px-3 py-1 text-sm opacity-70">No matches</div>
            )}
          </div>
        )}
      </div>

      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        className="w-14 rounded border border-neutral-700 bg-black/40 px-2 py-1 text-center"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="rounded border border-neutral-600 px-3 py-1 hover:bg-neutral-800 disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

/** tiny debounce */
function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
