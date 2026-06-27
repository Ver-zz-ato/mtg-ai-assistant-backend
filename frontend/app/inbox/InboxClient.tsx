"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getInboxArchivedKey, getInboxLastSeenKey } from "@/components/InboxLink";

type InboxItem = {
  id: string;
  commentId: string;
  kind: "deck" | "collection" | "roast" | "health_report" | "custom_card";
  resourceId: string;
  title: string;
  content: string;
  created_at: string;
  authorLabel: string;
  collectionSlug?: string;
  customCardSlug?: string;
};

function hrefFor(item: InboxItem): string {
  if (item.kind === "deck") return `/decks/${encodeURIComponent(item.resourceId)}`;
  if (item.kind === "collection") return item.collectionSlug ? `/binder/${encodeURIComponent(item.collectionSlug)}` : `/collections/${encodeURIComponent(item.resourceId)}`;
  if (item.kind === "roast") return `/roast/${encodeURIComponent(item.resourceId)}`;
  if (item.kind === "health_report") return `/share/health/${encodeURIComponent(item.resourceId)}`;
  if (item.kind === "custom_card") return `/cards/${encodeURIComponent(item.customCardSlug || item.resourceId)}`;
  return "/";
}

function labelFor(kind: InboxItem["kind"]): string {
  if (kind === "health_report") return "Health report";
  if (kind === "custom_card") return "Custom card";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function InboxClient() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenMs, setLastSeenMs] = useState(0);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const readArchivedIds = useCallback(() => {
    if (!user?.id) return new Set<string>();
    try {
      const raw = localStorage.getItem(getInboxArchivedKey(user.id));
      const parsed = JSON.parse(raw || "[]");
      return new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set<string>();
    }
  }, [user?.id]);

  const writeArchivedIds = useCallback((next: Set<string>) => {
    if (!user?.id) return;
    localStorage.setItem(getInboxArchivedKey(user.id), JSON.stringify(Array.from(next)));
    setArchivedIds(new Set(next));
    window.dispatchEvent(new Event("manatap:inbox-seen"));
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/inbox-comments", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load inbox.");
      const rows = Array.isArray(json.items) ? json.items : [];
      setItems(rows);
      setArchivedIds(readArchivedIds());
      const key = getInboxLastSeenKey(user.id);
      const raw = localStorage.getItem(key);
      const prevSeen = raw ? new Date(raw).getTime() : 0;
      setLastSeenMs(Number.isFinite(prevSeen) ? prevSeen : 0);
      localStorage.setItem(key, new Date().toISOString());
      window.dispatchEvent(new Event("manatap:inbox-seen"));
    } catch (e: any) {
      setError(e?.message || "Could not load inbox.");
    } finally {
      setLoading(false);
    }
  }, [readArchivedIds, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const newCount = useMemo(
    () => items.filter((item) => !archivedIds.has(item.id) && new Date(item.created_at).getTime() > lastSeenMs).length,
    [archivedIds, items, lastSeenMs],
  );
  const visibleItems = useMemo(
    () => items.filter((item) => showArchived || !archivedIds.has(item.id)),
    [archivedIds, items, showArchived],
  );

  function archiveItem(id: string) {
    const next = new Set(archivedIds);
    next.add(id);
    writeArchivedIds(next);
  }

  function restoreItem(id: string) {
    const next = new Set(archivedIds);
    next.delete(id);
    writeArchivedIds(next);
  }

  function archiveAllVisible() {
    const next = new Set(archivedIds);
    for (const item of visibleItems) next.add(item.id);
    writeArchivedIds(next);
  }

  if (authLoading) {
    return (
      <main className="min-h-[calc(100vh-82px)] bg-[#050608] px-4 py-10 text-white">
        <div className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-zinc-950/75 p-8 text-zinc-400">Loading inbox...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-[calc(100vh-82px)] bg-[#050608] px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-xl border border-amber-500/25 bg-amber-500/10 p-8">
          <h1 className="text-3xl font-black">Inbox</h1>
          <p className="mt-3 text-sm text-amber-100/85">Sign in to see comments on your public decks, binders, reports, roasts, and custom cards.</p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }))}
            className="mt-5 rounded-lg bg-amber-300 px-4 py-2 text-sm font-black text-black hover:bg-amber-200"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-82px)] bg-[#050608] text-white">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/profile" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
              Profile
            </Link>
            <h1 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">Inbox</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Comments on public things you own, gathered into one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Info label="Visible" value={String(visibleItems.length)} />
          <Info label="New since last open" value={String(newCount)} />
          <Info label="Archived" value={String(archivedIds.size)} />
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-500/35 bg-red-950/35 px-3 py-2 text-sm text-red-200">{error}</div> : null}

        {items.length ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={archiveAllVisible}
              disabled={!visibleItems.length}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              Archive visible
            </button>
            <button
              type="button"
              onClick={() => setShowArchived((current) => !current)}
              className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/10"
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
            {archivedIds.size ? (
              <button
                type="button"
                onClick={() => writeArchivedIds(new Set())}
                className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/10"
              >
                Restore all
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {visibleItems.length === 0 && !loading ? (
            <div className="rounded-xl border border-neutral-800 bg-zinc-950/75 px-4 py-10 text-center text-sm text-neutral-500">
              {items.length ? "Everything visible is archived. Show archived or restore all to bring messages back." : "No comments yet. Shared decks, public binders, roasts, health reports, and custom cards will show here when people comment."}
            </div>
          ) : null}

          {visibleItems.map((item) => {
            const isNew = new Date(item.created_at).getTime() > lastSeenMs;
            const isArchived = archivedIds.has(item.id);
            return (
              <article
                key={item.id}
                className={`rounded-xl border p-4 transition ${
                  isArchived
                    ? "border-neutral-800 bg-zinc-950/45 opacity-70"
                    : isNew
                      ? "border-cyan-300/45 bg-cyan-300/10"
                      : "border-neutral-800 bg-zinc-950/75"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link
                    href={hrefFor(item)}
                    className={`min-w-0 flex-1 rounded-lg transition ${
                  isNew
                    ? "hover:bg-cyan-300/10"
                    : "hover:bg-zinc-900/70"
                }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-300">
                        {labelFor(item.kind)}
                      </span>
                      {isNew ? <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[11px] font-black text-black">New</span> : null}
                      {isArchived ? <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-[11px] font-black text-neutral-200">Archived</span> : null}
                    </div>
                    <h2 className="mt-2 truncate text-base font-black text-white">{item.title || "Untitled"}</h2>
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-neutral-300">{item.content}</p>
                  </Link>
                  <div className="shrink-0 text-left text-xs text-neutral-500 sm:text-right">
                    <p>{item.authorLabel || "Someone"}</p>
                    <p className="mt-1">{formatWhen(item.created_at)}</p>
                    <button
                      type="button"
                      onClick={() => (isArchived ? restoreItem(item.id) : archiveItem(item.id))}
                      className="mt-3 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-bold text-neutral-200 hover:bg-neutral-800"
                    >
                      {isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-zinc-950/75 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-black text-white">{value}</p>
    </div>
  );
}
