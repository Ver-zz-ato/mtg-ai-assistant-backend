"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export const INBOX_LAST_SEEN_PREFIX = "manatap:inbox:last-seen";
export const INBOX_ARCHIVED_PREFIX = "manatap:inbox:archived";

type Props = {
  className?: string;
  label?: string;
  onClick?: () => void;
};

function lastSeenKey(userId: string) {
  return `${INBOX_LAST_SEEN_PREFIX}:${userId}`;
}

function archivedKey(userId: string) {
  return `${INBOX_ARCHIVED_PREFIX}:${userId}`;
}

export function getInboxLastSeenKey(userId: string) {
  return lastSeenKey(userId);
}

export function getInboxArchivedKey(userId: string) {
  return archivedKey(userId);
}

function readArchivedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(archivedKey(userId));
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export default function InboxLink({ className = "", label = "Inbox", onClick }: Props) {
  const { user } = useAuth();
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setNewCount(0);
      return;
    }
    const userId = user.id;

    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/users/me/inbox-comments", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive || !res.ok || !json?.ok || !Array.isArray(json.items)) return;
        const raw = localStorage.getItem(lastSeenKey(userId));
        const archived = readArchivedIds(userId);
        const lastSeenMs = raw ? new Date(raw).getTime() : 0;
        const count = json.items.filter((item: { id?: string; commentId?: string; created_at?: string }) => {
          const id = String(item.id || item.commentId || "");
          if (id && archived.has(id)) return false;
          const t = item.created_at ? new Date(item.created_at).getTime() : 0;
          return Number.isFinite(t) && t > lastSeenMs;
        }).length;
        setNewCount(count);
      } catch {
        if (alive) setNewCount(0);
      }
    }

    void load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("manatap:inbox-seen", onFocus);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("manatap:inbox-seen", onFocus);
    };
  }, [user?.id]);

  if (!user) return null;

  return (
    <Link href="/inbox" className={`relative ${className}`} onClick={onClick}>
      {label}
      {newCount > 0 ? (
        <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-cyan-300 px-1.5 py-0.5 align-middle text-[10px] font-black leading-none text-black">
          {newCount > 99 ? "99+" : newCount}
        </span>
      ) : null}
    </Link>
  );
}
