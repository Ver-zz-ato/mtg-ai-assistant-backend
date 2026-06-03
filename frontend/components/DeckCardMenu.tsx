"use client";
import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";
import { validatePublicText } from "@/lib/profanity";
import { PUBLIC_DECK_TITLE_QUALITY_ERROR, isLowQualityPublicDeckTitle } from "@/lib/deck/publicDeckValidation";
import { toast, toastError } from "@/lib/toast-client";

export default function DeckCardMenu({ id, title, is_public }: { id: string; title: string | null; is_public: boolean | null }) {
  const [open, setOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishAim, setPublishAim] = React.useState("");
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [visibilityBusy, setVisibilityBusy] = React.useState(false);
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
      if (isLowQualityPublicDeckTitle(title)) {
        toastError(PUBLIC_DECK_TITLE_QUALITY_ERROR);
        setOpen(false);
        return;
      }
      setPublishAim("");
      setPublishError(null);
      setPublishOpen(true);
      setOpen(false);
      return;
    }

    setVisibilityBusy(true);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(id)}/publish`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        const message = j?.error || "Failed to update";
        if (String(message).toLowerCase().includes("please wait")) toast(message, "warning");
        else toastError(message);
        setOpen(false);
        return;
      }
      toast("Deck is private.", "success");
      router.refresh();
      setOpen(false);
    } catch (e: any) {
      toastError(e?.message || "Failed to update");
      setOpen(false);
    } finally {
      setVisibilityBusy(false);
    }
  }

  async function submitPublishAim() {
    const nextAim = publishAim.trim().slice(0, 500);
    if (!nextAim) {
      setPublishError("Add a deck aim / strategy before making this public.");
      return;
    }
    const aimCheck = validatePublicText(nextAim, "Deck aim");
    if (!aimCheck.ok) {
      setPublishError(aimCheck.message);
      return;
    }
    setVisibilityBusy(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/decks/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, is_public: true, deck_aim: nextAim }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        const message = j?.error || "Failed to update";
        setPublishError(message);
        if (String(message).toLowerCase().includes("please wait")) toast(message, "warning");
        else toastError(message);
        return;
      }
      toast("Deck is public.", "success");
      setPublishOpen(false);
      router.refresh();
    } catch (e: any) {
      const message = e?.message || "Failed to update";
      setPublishError(message);
      toastError(message);
    } finally {
      setVisibilityBusy(false);
    }
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
      toast("Share link copied.", "success");
    } catch {
      toastError("Copy failed");
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
            <button onClick={togglePublic} disabled={visibilityBusy} className="w-full text-left px-3 py-2 hover:bg-neutral-900 disabled:opacity-60">
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
      {publishOpen &&
        createPortal(
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-950 p-4 shadow-2xl">
              <h3 className="text-base font-semibold text-white">Describe the deck before publishing</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Add the deck&apos;s aim and strategy. This is required before the deck can go public.
              </p>
              <textarea
                value={publishAim}
                onChange={(e) => setPublishAim(e.target.value.slice(0, 500))}
                placeholder="Token swarm with aristocrats payoffs..."
                className="mt-3 h-28 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-xs text-red-400">{publishError}</span>
                <span className="text-[11px] text-neutral-500">{publishAim.trim().length}/500</span>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPublishOpen(false);
                    setPublishError(null);
                  }}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={visibilityBusy}
                  onClick={() => void submitPublishAim()}
                  className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  Make Public
                </button>
              </div>
            </div>
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
