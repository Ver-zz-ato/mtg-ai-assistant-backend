"use client";

import React from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toast-client";

type DestinationKind = "collection" | "deck" | "wishlist";

type CardInput = {
  name: string;
  qty: number;
};

type DestinationRow = {
  id: string;
  label: string;
  sublabel?: string | null;
};

type WebsiteAddCardDestinationModalProps = {
  open: boolean;
  onClose: () => void;
  cards: CardInput[];
  allowedKinds?: DestinationKind[];
  title?: string;
  subtitle?: string;
  onSuccess?: (info: { kind: DestinationKind; name: string }) => void;
};

const DEFAULT_KINDS: DestinationKind[] = ["collection", "deck", "wishlist"];

export default function WebsiteAddCardDestinationModal({
  open,
  onClose,
  cards,
  allowedKinds = DEFAULT_KINDS,
  title = "Add to collection, deck, or wishlist",
  subtitle,
  onSuccess,
}: WebsiteAddCardDestinationModalProps) {
  const { user } = useAuth();
  const supabase = React.useMemo(() => createBrowserSupabaseClient(), []);
  const uniqueCards = React.useMemo(() => {
    const merged = new Map<string, number>();
    for (const card of cards) {
      const name = String(card?.name || "").trim();
      const qty = Math.max(1, Number(card?.qty) || 1);
      if (!name) continue;
      merged.set(name, (merged.get(name) || 0) + qty);
    }
    return Array.from(merged.entries()).map(([name, qty]) => ({ name, qty }));
  }, [cards]);
  const totalCopies = React.useMemo(
    () => uniqueCards.reduce((sum, card) => sum + card.qty, 0),
    [uniqueCards],
  );
  const firstCardName = uniqueCards[0]?.name || "";
  const [activeTab, setActiveTab] = React.useState<DestinationKind>(allowedKinds[0] || "collection");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [collections, setCollections] = React.useState<DestinationRow[]>([]);
  const [decks, setDecks] = React.useState<DestinationRow[]>([]);
  const [wishlists, setWishlists] = React.useState<DestinationRow[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Record<DestinationKind, string | null>>({
    collection: null,
    deck: null,
    wishlist: null,
  });

  React.useEffect(() => {
    if (!open) return;
    setActiveTab((prev) => (allowedKinds.includes(prev) ? prev : allowedKinds[0] || "collection"));
  }, [open, allowedKinds]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;

    async function loadDestinations() {
      setLoading(true);
      setError(null);
      try {
        const [collectionsRes, decksRes, wishlistsRes] = await Promise.all([
          fetch("/api/collections/list", { cache: "no-store" }),
          fetch("/api/decks/list", { cache: "no-store" }),
          fetch("/api/wishlists/list", { cache: "no-store" }),
        ]);

        const [collectionsJson, decksJson, wishlistsJson] = await Promise.all([
          collectionsRes.json().catch(() => ({})),
          decksRes.json().catch(() => ({})),
          wishlistsRes.json().catch(() => ({})),
        ]);

        if (!collectionsRes.ok || collectionsJson?.ok === false) {
          throw new Error(collectionsJson?.error || "Could not load collections.");
        }
        if (!decksRes.ok || decksJson?.ok === false) {
          throw new Error(decksJson?.error || "Could not load decks.");
        }
        if (!wishlistsRes.ok || wishlistsJson?.ok === false) {
          throw new Error(wishlistsJson?.error || "Could not load wishlists.");
        }

        if (cancelled) return;

        const nextCollections = Array.isArray(collectionsJson?.collections)
          ? collectionsJson.collections.map((row: { id: string; name?: string | null }) => ({
              id: String(row.id),
              label: String(row.name || "Collection").trim() || "Collection",
            }))
          : [];
        const nextDecks = Array.isArray(decksJson?.decks)
          ? decksJson.decks.map((row: { id: string; title?: string | null; format?: string | null }) => ({
              id: String(row.id),
              label: String(row.title || "Deck").trim() || "Deck",
              sublabel: row.format ? String(row.format) : null,
            }))
          : [];
        const nextWishlists = Array.isArray(wishlistsJson?.wishlists)
          ? wishlistsJson.wishlists.map((row: { id: string; name?: string | null }) => ({
              id: String(row.id),
              label: String(row.name || "Wishlist").trim() || "Wishlist",
            }))
          : [];

        setCollections(nextCollections);
        setDecks(nextDecks);
        setWishlists(nextWishlists);
        setSelectedIds((prev) => ({
          collection:
            prev.collection && nextCollections.some((row: DestinationRow) => row.id === prev.collection)
              ? prev.collection
              : nextCollections[0]?.id ?? null,
          deck:
            prev.deck && nextDecks.some((row: DestinationRow) => row.id === prev.deck)
              ? prev.deck
              : nextDecks[0]?.id ?? null,
          wishlist:
            prev.wishlist && nextWishlists.some((row: DestinationRow) => row.id === prev.wishlist)
              ? prev.wishlist
              : nextWishlists[0]?.id ?? null,
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load destinations.");
          setCollections([]);
          setDecks([]);
          setWishlists([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDestinations();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const activeRows = React.useMemo(() => {
    if (activeTab === "deck") return decks;
    if (activeTab === "wishlist") return wishlists;
    return collections;
  }, [activeTab, collections, decks, wishlists]);

  const activeSelectedId = selectedIds[activeTab];

  async function handleCreateCollection() {
    if (!user) return;
    setCreating(true);
    setError(null);
    try {
      const { data, error: createError } = await supabase
        .from("collections")
        .insert({ user_id: user.id, name: "New collection" })
        .select("id, name")
        .single();
      if (createError || !data) throw new Error(createError?.message || "Could not create collection.");
      const row = {
        id: String(data.id),
        label: String(data.name || "New collection"),
      };
      setCollections((prev) => [row, ...prev]);
      setSelectedIds((prev) => ({ ...prev, collection: row.id }));
      setActiveTab("collection");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create collection.");
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirm() {
    if (!user || uniqueCards.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      if (activeTab === "wishlist") {
        const chosen = wishlists.find((row) => row.id === activeSelectedId);
        await Promise.all(
          uniqueCards.map(async (card) => {
            const response = await fetch("/api/wishlists/add", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                wishlist_id: activeSelectedId || undefined,
                names: [card.name],
                qty: card.qty,
              }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || json?.ok === false) {
              throw new Error(json?.error || `Could not add ${card.name} to wishlist.`);
            }
          }),
        );
        onSuccess?.({ kind: "wishlist", name: chosen?.label || "Wishlist" });
        toast(
          uniqueCards.length === 1
            ? `${firstCardName} added to ${chosen?.label || "wishlist"}.`
            : `${uniqueCards.length} cards added to ${chosen?.label || "wishlist"}.`,
          "success",
        );
        onClose();
        return;
      }

      if (!activeSelectedId) return;

      const chosen = activeRows.find((row) => row.id === activeSelectedId);
      await Promise.all(
        uniqueCards.map(async (card) => {
          const response =
            activeTab === "deck"
              ? await fetch(`/api/decks/cards?deckid=${encodeURIComponent(activeSelectedId)}`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name: card.name, qty: card.qty }),
                })
              : await fetch("/api/collections/cards", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ collectionId: activeSelectedId, name: card.name, qty: card.qty }),
                });

          const json = await response.json().catch(() => ({}));
          if (!response.ok || json?.ok === false) {
            throw new Error(json?.error || `Could not add ${card.name}.`);
          }
        }),
      );

      onSuccess?.({ kind: activeTab, name: chosen?.label || (activeTab === "deck" ? "Deck" : "Collection") });
      toast(
        uniqueCards.length === 1
          ? `${firstCardName} added to ${chosen?.label || activeTab}.`
          : `${uniqueCards.length} cards added to ${chosen?.label || activeTab}.`,
        "success",
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add cards.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !user) return null;

  const canSubmit = activeTab === "wishlist" ? uniqueCards.length > 0 : Boolean(activeSelectedId) && uniqueCards.length > 0;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-xl rounded-xl border border-amber-300/20 bg-[#11100d] p-5 shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-neutral-100">{title}</h3>
            <p className="mt-1 text-sm text-neutral-400">
              {subtitle || (uniqueCards.length === 1 ? firstCardName : `${uniqueCards.length} cards selected - ${totalCopies} total copies`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-neutral-300 transition hover:text-white"
            aria-label="Close add destination picker"
          >
            x
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-lg border border-white/10 bg-black/30 p-1">
          {allowedKinds.map((kind) => {
            const active = kind === activeTab;
            const label = kind === "collection" ? "Collection" : kind === "deck" ? "Decks" : "Wishlists";
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveTab(kind)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "bg-amber-300 text-black" : "text-neutral-300 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {error ? <div className="mt-3 rounded-lg border border-red-400/20 bg-red-950/30 px-3 py-2 text-sm text-red-100">{error}</div> : null}

        <div className="mt-4">
          {loading ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-neutral-400">Loading destinations...</div>
          ) : activeRows.length > 0 ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {activeRows.map((row) => {
                const selectedRow = row.id === activeSelectedId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedIds((prev) => ({ ...prev, [activeTab]: row.id }))}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                      selectedRow
                        ? "border-amber-300/45 bg-amber-300/10"
                        : "border-white/10 bg-black/20 hover:border-amber-300/25 hover:bg-black/30"
                    }`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selectedRow ? "border-amber-300" : "border-neutral-600"}`}>
                      {selectedRow ? <span className="h-2.5 w-2.5 rounded-full bg-amber-300" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-100">{row.label}</span>
                      {row.sublabel ? <span className="mt-0.5 block truncate text-xs text-neutral-500">{row.sublabel}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-neutral-100">
                {activeTab === "collection" ? "No collections yet" : activeTab === "deck" ? "No decks yet" : "No wishlists yet"}
              </div>
              <p className="mt-2 text-sm text-neutral-400">
                {activeTab === "collection"
                  ? "Create a collection here, then add these cards in one tap."
                  : activeTab === "deck"
                    ? "Create a deck first, then you can copy cards straight into it from here."
                    : "Your first wishlist will be created automatically when you add these cards."}
              </p>
              {activeTab === "collection" ? (
                <button
                  type="button"
                  onClick={() => void handleCreateCollection()}
                  disabled={creating}
                  className="mt-3 inline-flex items-center rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create collection"}
                </button>
              ) : activeTab === "deck" ? (
                <Link href="/new-deck" onClick={onClose} className="mt-3 inline-flex items-center rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-black transition hover:bg-amber-200">
                  Create deck
                </Link>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canSubmit || saving || loading}
            className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
