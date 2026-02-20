// components/CardAutocomplete.tsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { trackCardSearch, trackCardSelected } from '@/lib/analytics-enhanced';
import { aiMemory } from '@/lib/ai-memory';

type Item = { name: string } | string;

function norm(items: any): string[] {
  // Accepts: {data:[{name}]}, {cards:[{name}]}, string[], [{name}], etc.
  if (!items) return [];
  if (Array.isArray(items)) {
    return items.map((v) => (typeof v === "string" ? v : v?.name)).filter(Boolean);
  }
  if (Array.isArray(items.data)) return norm(items.data);
  if (Array.isArray(items.cards)) return norm(items.cards);
  return [];
}

export default function CardAutocomplete({
  value,
  onChange,
  onPick,
  onPickValidated,
  placeholder = "Search card…",
  minChars = 2,
  searchUrl = "/api/cards/search",
  debounceMs = 180,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (name: string) => void;
  onPickValidated?: (name: string) => void;
  placeholder?: string;
  minChars?: number;
  searchUrl?: string;
  debounceMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const latestQ = useRef("");

  // Debounced search
  const q = value.trim();
  useEffect(() => {
    if (q.length < minChars) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        latestQ.current = q;
        const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (latestQ.current !== q) return;
        const list = norm(json);
        
        // Track search analytics
        trackCardSearch(q, list.length, 'autocomplete');
        
        setItems(list.slice(0, 20));
        setOpen(list.length > 0);
        setHi(0);
      } catch {
        setItems([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [q, minChars, searchUrl, debounceMs]);

  // Close on blur (but let mousedown on items run first)
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pick = items[hi];
        if (pick) {
          trackCardSelected(pick, q, hi);
          
          // Track card in AI memory
          try {
            if (localStorage.getItem('ai_memory_consent') === 'true') {
              aiMemory.addRecentCard(pick);
            }
          } catch {}
          
          // If onPickValidated is provided, use it (name came from validated dropdown)
          // Otherwise use regular onPick
          if (onPickValidated) {
            onPickValidated(pick);
          } else {
            onPick(pick);
          }
          setOpen(false);
        }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full overflow-visible">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKey}
        className="w-full rounded border border-gray-600 bg-transparent px-2 py-1 outline-none"
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded border border-gray-700 bg-black/90 shadow-lg backdrop-blur">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>
          )}
          {!loading &&
            items.map((name, i) => (
              <div
                key={`${name}-${i}`}
                // Use mousedown so blur on input doesn't swallow the click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  trackCardSelected(name, q, i);
                  
                  // Track card in AI memory
                  try {
                    if (localStorage.getItem('ai_memory_consent') === 'true') {
                      aiMemory.addRecentCard(name);
                    }
                  } catch {}
                  
                  onChange(name);
                  // If onPickValidated is provided, use it (name came from validated dropdown)
                  // Otherwise use regular onPick
                  if (onPickValidated) {
                    onPickValidated(name);
                  } else {
                    onPick(name);
                  }
                  setOpen(false);
                }}
                onMouseEnter={() => setHi(i)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  hi === i ? "bg-gray-800 text-white" : "text-gray-200 hover:bg-gray-800"
                }`}
              >
                {name}
              </div>
            ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
