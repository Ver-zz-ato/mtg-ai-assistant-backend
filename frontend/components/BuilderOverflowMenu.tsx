"use client";

import React, { useState, useEffect, useRef } from "react";
import { listThreads, renameThread, deleteThread, linkThread } from "@/lib/threads";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ThreadSummary } from "@/types/chat";

type Props = {
  threadId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  onChanged?: () => void;
  onDeleted?: () => void;
  onNewChat?: () => void;
  deckId?: string | null;
  messageCount?: number;
  refreshKey?: number;
};

export default function BuilderOverflowMenu({
  threadId,
  value,
  onChange,
  onChanged,
  onDeleted,
  onNewChat,
  deckId,
  messageCount,
  refreshKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [linkMode, setLinkMode] = useState(false);
  const [linked, setLinked] = useState<boolean>(!!deckId);
  const [choices, setChoices] = useState<Array<{ id: string; title: string }>>([]);
  const [sel, setSel] = useState<string>("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let aborted = false;
    const ac = new AbortController();
    async function run() {
      try {
        const res = await listThreads(ac.signal);
        const items = (res?.threads ?? []) as ThreadSummary[];
        if (!aborted) setThreads(Array.isArray(items) ? items : []);
      } catch {
        if (!aborted) setThreads([]);
      }
    }
    run();
    return () => {
      aborted = true;
      try {
        ac.abort();
      } catch {}
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!threadId) {
        setLinked(false);
        return;
      }
      try {
        const r = await fetch("/api/chat/threads/get", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const one = (Array.isArray(j?.threads) ? j.threads : Array.isArray(j?.data) ? j.data : []).find(
          (t: { id?: string }) => t.id === threadId
        );
        if (!cancelled) setLinked(!!(one as { deck_id?: string })?.deck_id);
      } catch {}
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setLinkMode(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function doRename() {
    const t = prompt("Rename thread to:");
    if (!t || !threadId) return;
    setBusy(true);
    try {
      await renameThread(threadId, t);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!threadId) return;
    if (!confirm("Delete this thread?")) return;
    setBusy(true);
    try {
      await deleteThread(threadId);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
    setOpen(false);
  }

  async function openLink() {
    if (!threadId) return;
    setLinkMode((v) => !v);
    if (choices.length === 0) {
      try {
        const sb = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await sb.auth.getUser();
        const uid = user?.id;
        if (!uid) return;
        const { data } = await sb
          .from("decks")
          .select("id,title")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });
        setChoices(((data as { id: string; title: string }[]) || []).map((d) => ({ id: d.id, title: d.title })));
      } catch {}
    }
  }

  async function saveLink() {
    if (!threadId) return;
    setBusy(true);
    try {
      await linkThread(threadId, sel || null);
      setLinked(!!sel);
      setLinkMode(false);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  function handleNewChat() {
    onNewChat?.();
    setOpen(false);
  }

  function handleSelectThread(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  const disabled = !threadId || busy;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/80 transition-colors"
        title="Thread options"
        aria-label="Thread options"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div 
          className="fixed w-56 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl z-[100]" 
          style={{ 
            top: (menuRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
            right: Math.max(8, window.innerWidth - (menuRef.current?.getBoundingClientRect().right ?? 0))
          }}
        >
          <button
            onClick={handleNewChat}
            className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
            data-testid="new-chat-button"
          >
            New thread
          </button>

          {threads.length > 0 && (
            <>
              <div className="border-t border-neutral-700 my-1" />
              <div className="max-h-40 overflow-y-auto">
                {threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectThread(t.id)}
                    className={`w-full px-3 py-2 text-left text-sm truncate ${
                      value === t.id ? "bg-neutral-700/80 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    }`}
                  >
                    {t.title ?? t.id}
                  </button>
                ))}
              </div>
              <div className="border-t border-neutral-700 my-1" />
            </>
          )}

          <button
            onClick={doRename}
            disabled={disabled}
            className="w-full px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
            data-testid="thread-action"
          >
            Rename
          </button>
          <button
            onClick={doDelete}
            disabled={disabled}
            className="w-full px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
            data-testid="thread-action"
          >
            Delete
          </button>
          <button
            onClick={openLink}
            disabled={disabled}
            className="w-full px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
            title={linked ? "Change link" : "Link to deck"}
            data-testid="thread-action"
          >
            {linked ? "Change link" : "Link deck"}
            {linked && <span className="ml-1 text-neutral-500">✓</span>}
          </button>

          {linkMode && (
            <div className="px-3 py-2 border-t border-neutral-700 space-y-2">
              <select
                className="w-full rounded bg-neutral-800 border border-neutral-600 px-2 py-1.5 text-xs text-neutral-200"
                value={sel}
                onChange={(e) => setSel(e.target.value)}
              >
                <option value="">— Unlink —</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button
                  onClick={saveLink}
                  disabled={busy}
                  className="flex-1 px-2 py-1 rounded bg-neutral-600 hover:bg-neutral-500 text-white text-xs"
                >
                  Save
                </button>
                <button
                  onClick={() => setLinkMode(false)}
                  disabled={busy}
                  className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
