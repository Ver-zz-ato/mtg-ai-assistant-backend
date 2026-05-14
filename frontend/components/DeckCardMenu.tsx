"use client";
import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

export default function DeckCardMenu({ id, title, is_public }: { id: string; title: string | null; is_public: boolean | null }) {
  const [open, setOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { isPro } = useProStatus();

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const button = ref.current?.querySelector("button");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 176;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
      setMenuPos({ top: rect.bottom + 4, left });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  async function togglePublic() {
    if (!is_public) {
      try {
        const res = await fetch("/api/decks/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, is_public: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok && j?.error) {
          alert(j.error);
          setOpen(false);
          return;
        }
      } catch (e: any) {
        alert(e?.message || "Failed to update");
        setOpen(false);
        return;
      }
    } else {
      await fetch("/api/decks/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, is_public: false }),
      });
    }
    router.refresh();
    setOpen(false);
  }

  async function copyLink() {
    track(
      "ui_click",
      {
        area: "deck",
        action: "share",
        deckId: id,
      },
      {
        userId: user?.id || null,
        isPro,
      },
    );

    try {
      const origin = location.origin;
      await navigator.clipboard.writeText(`${origin}/decks/${id}`);
      alert("Share link copied");
    } catch {
      alert("Copy failed");
    }
    setOpen(false);
  }

  async function rename() {
    const name = prompt("New deck title:", title || "Untitled Deck");
    if (name == null) return;
    await fetch("/api/decks/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title: name }),
    });
    router.refresh();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="px-2 py-1 rounded border border-neutral-700 text-xs" title="More">
        ...
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed w-44 rounded border border-neutral-800 bg-neutral-950 shadow-xl z-[1000] text-sm"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button onClick={togglePublic} className="w-full text-left px-3 py-2 hover:bg-neutral-900">
              {is_public ? "Make Private" : "Make Public"}
            </button>
            <button onClick={copyLink} className="w-full text-left px-3 py-2 hover:bg-neutral-900">
              Copy link
            </button>
            <button onClick={rename} className="w-full text-left px-3 py-2 hover:bg-neutral-900">
              Rename
            </button>
            <button onClick={() => { setConfirmOpen(true); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-neutral-900 text-red-400">
              Delete
            </button>
          </div>,
          document.body,
        )}
      {confirmOpen &&
        (() => {
          const Modal = require("./ConfirmDeleteModal").default;
          return (
            <Modal
              open={confirmOpen}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={async () => {
                try {
                  const res = await fetch("/api/decks/delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ id }),
                  });
                  const j = await res.json().catch(() => ({}));
                  if (!res.ok || j?.ok === false) throw new Error(j?.error || "Delete failed");
                  setConfirmOpen(false);
                  router.refresh();
                } catch (e: any) {
                  alert(e?.message || "Delete failed");
                }
              }}
            />
          );
        })()}
    </div>
  );
}
