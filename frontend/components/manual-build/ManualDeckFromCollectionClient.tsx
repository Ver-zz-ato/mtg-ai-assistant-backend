"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FormatPickerModal, {
  formatToApiString,
  type PickedDeckFormat,
} from "@/components/FormatPickerModal";
import ManualCollectionCommanderPicker from "./ManualCollectionCommanderPicker";
import OutsideCollectionToggle from "./OutsideCollectionToggle";
import OutsideCardSearchAdd from "./OutsideCardSearchAdd";
import ManualCollectionColorFilter from "./ManualCollectionColorFilter";
import ManualCollectionBrowseRow from "./ManualCollectionBrowseRow";
import type { CollectionCardMeta } from "@/lib/build/useCollectionBuildMetadata";
import { resolveMetaFromMap } from "@/lib/scryfall-cache-lookup";
import { getCollectionCardBucket, type CollectionCardBucket } from "@/lib/build/collectionCardBucket";
import { CollectionManualDeckDraft } from "@/lib/build/collectionManualDeckDraft";
import {
  cardMatchesColorFilter,
  type CollectionColorPip,
} from "@/lib/build/collectionColorFilter";
import {
  COLLECTION_BUCKET_LABELS,
  sortCollectionCards,
  type CollectionSortMode,
} from "@/lib/build/sortCollectionCards";
import { useCollectionBuildMetadata } from "@/lib/build/useCollectionBuildMetadata";
import { getDeckHardCapMessage, getExpectedCount } from "@/lib/deck/formatCompliance";
import { getFormatRules, isBasicLandName, isCommanderFormatString } from "@/lib/deck/formatRules";

const TABS: CollectionCardBucket[] = ["lands", "creatures", "spells", "other"];
const PAGE = 24;

const TAB_CLASS: Record<CollectionCardBucket, { on: string; off: string }> = {
  lands: {
    on: "bg-emerald-900/40 border-emerald-500/50 text-emerald-200",
    off: "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800",
  },
  creatures: {
    on: "bg-orange-900/35 border-orange-500/50 text-orange-200",
    off: "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800",
  },
  spells: {
    on: "bg-blue-900/35 border-blue-500/50 text-blue-200",
    off: "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800",
  },
  other: {
    on: "bg-purple-900/35 border-purple-500/50 text-purple-200",
    off: "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800",
  },
};

function sortCommanderPips(ids: string[] | null | undefined): CollectionColorPip[] {
  const order = ["W", "U", "B", "R", "G"] as const;
  if (!ids?.length) return [];
  const set = new Set(ids.map((c) => String(c).toUpperCase()));
  return order.filter((c) => set.has(c));
}

type Step = "format" | "commander" | "browse";

interface ManualDeckFromCollectionClientProps {
  collectionId: string;
  initialFormat?: string | null;
  initialCommander?: string | null;
}

export default function ManualDeckFromCollectionClient({
  collectionId,
  initialFormat,
  initialCommander,
}: ManualDeckFromCollectionClientProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(() => {
    if (!initialFormat) return "format";
    if (isCommanderFormatString(initialFormat) && !initialCommander?.trim()) return "commander";
    return "browse";
  });
  const [format, setFormat] = useState(initialFormat || "Commander");
  const [commander, setCommander] = useState(initialCommander || "");
  const [draft] = useState(() => new CollectionManualDeckDraft());
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);

  const [tab, setTab] = useState<CollectionCardBucket>("lands");
  const [sortMode, setSortMode] = useState<CollectionSortMode>("price");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [outsideCollection, setOutsideCollection] = useState(false);
  const [commanderMeta, setCommanderMeta] = useState<CollectionCardMeta | undefined>();
  const [colorFilter, setColorFilter] = useState<CollectionColorPip[]>([]);
  const [colorLockToast, setColorLockToast] = useState(false);

  const {
    items,
    metaByName,
    loading,
    error: loadError,
    commanderCandidates,
    normName,
    metaCoverage,
    resolveMeta,
    fetchMetaForName,
  } = useCollectionBuildMetadata(collectionId);

  const getMeta = useCallback(
    (name: string) => resolveMeta(name) ?? resolveMetaFromMap(metaByName, name),
    [resolveMeta, metaByName],
  );

  const commanderColorPips = useMemo(() => {
    if (!isCommanderFormatString(format)) return [] as CollectionColorPip[];
    const m = commanderMeta ?? (commander.trim() ? getMeta(commander) : undefined);
    return sortCommanderPips(m?.color_identity ?? null);
  }, [format, commander, commanderMeta, getMeta]);

  const activeColorFilter = isCommanderFormatString(format) ? commanderColorPips : colorFilter;

  useEffect(() => {
    if (!colorLockToast) return;
    const dismiss = () => setColorLockToast(false);
    const timer = setTimeout(dismiss, 3200);
    document.addEventListener("click", dismiss, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", dismiss, true);
    };
  }, [colorLockToast]);

  const indexedItems = useMemo(
    () =>
      items.map((item) => {
        const m = getMeta(item.name);
        return {
          id: item.id,
          name: item.name,
          collectionQty: item.qty,
          meta: m,
          bucket: getCollectionCardBucket(m),
        };
      }),
    [items, getMeta],
  );

  const totalInDeck = draft.totalCards();
  const hardCapMsg = getDeckHardCapMessage(totalInDeck);
  const expected = getExpectedCount(format);
  const countHint =
    expected != null
      ? `${totalInDeck} cards · ${format} is usually ${expected}`
      : `${totalInDeck} cards`;

  const tabRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = indexedItems.filter((row) => row.bucket === tab);
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    if (activeColorFilter.length > 0) {
      rows = rows.filter((r) => cardMatchesColorFilter(r.meta?.color_identity, activeColorFilter));
    }
    const sorted = sortCollectionCards(
      rows.map((r) => ({
        name: r.name,
        qty: r.collectionQty,
        priceUsd: r.meta?.priceUsd,
        color_identity: r.meta?.color_identity,
      })),
      sortMode,
    );
    const order = new Map(sorted.map((r, i) => [r.name, i]));
    return [...rows].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
  }, [indexedItems, tab, search, sortMode, activeColorFilter]);

  const visibleRows = tabRows.slice(0, visible);

  const cycleSort = () => {
    setSortMode((m) => (m === "price" ? "name" : "price"));
    setVisible(PAGE);
  };

  const handleSave = useCallback(async () => {
    if (hardCapMsg) {
      setError(hardCapMsg);
      return;
    }
    const deckTitle = title.trim() || "Collection build";
    setSaving(true);
    setError(null);
    try {
      const cmd = isCommanderFormatString(format) ? commander.trim() : "";
      const cmdMeta = commanderMeta ?? getMeta(cmd);
      const colors = cmd && cmdMeta?.color_identity ? cmdMeta.color_identity : [];
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deckTitle,
          format,
          plan: "Optimized",
          colors: colors ?? [],
          deck_text: draft.toDeckText(cmd || null),
          creation_source: "manual",
          is_public: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed");
      router.push(`/my-decks/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }, [hardCapMsg, title, format, commander, commanderMeta, getMeta, draft, router]);

  if (step === "format") {
    return (
      <div className="min-h-[60vh] flex flex-col">
        <Link
          href={`/collections/${collectionId}`}
          className="text-sm text-neutral-400 hover:text-white mb-4 inline-block"
        >
          ← Back to collection
        </Link>
        <FormatPickerModal
          isOpen
          onClose={() => router.push(`/collections/${collectionId}`)}
          onSelect={(f: PickedDeckFormat) => {
            const apiFormat = formatToApiString(f);
            setFormat(apiFormat);
            if (f === "commander") {
              setStep("commander");
            } else {
              setCommander("");
              setStep("browse");
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[70vh] max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          href={`/collections/${collectionId}`}
          className="text-sm text-neutral-400 hover:text-white"
        >
          ← Collection
        </Link>
        <span className="text-xs text-neutral-500">{format}</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-1 text-center">Build deck manually</h1>
      {isCommanderFormatString(format) && commander ? (
        <p className="text-sm text-purple-300 mb-4 text-center">
          Commander: <strong>{commander}</strong>
          <button
            type="button"
            className="ml-2 text-xs underline text-neutral-400"
            onClick={() => setStep("commander")}
          >
            Change
          </button>
        </p>
      ) : null}

      {step === "commander" ? (
        <ManualCollectionCommanderPicker
          candidates={commanderCandidates}
          metaByName={metaByName}
          normName={normName}
          selectedCommander={commander}
          loading={loading}
          metaCoverage={metaCoverage}
          onSelect={(name, meta) => {
            setCommander(name);
            setCommanderMeta(meta);
            if (meta) {
              const next = new Map(metaByName);
              for (const k of [normName(name)]) {
                next.set(k, { ...next.get(k), ...meta });
              }
            } else {
              void fetchMetaForName(name).then((m) => setCommanderMeta(m));
            }
          }}
          onContinue={() => setStep("browse")}
          onBack={() => setStep("format")}
        />
      ) : (
        <>
          {loading ? (
            <p className="text-neutral-400 text-sm py-8">Loading collection…</p>
          ) : loadError ? (
            <p className="text-red-400 text-sm">{loadError}</p>
          ) : (
            <>
              <OutsideCollectionToggle
                checked={outsideCollection}
                onChange={setOutsideCollection}
              />

              {outsideCollection ? (
                <OutsideCardSearchAdd
                  onPick={(name, meta) => {
                    const collectionRow = items.find(
                      (i) => normName(i.name) === normName(name),
                    );
                    const qty = collectionRow?.qty ?? 0;
                    const outside = !collectionRow;
                    if (draft.addOne(name, format, qty, { outsideCollection: outside })) {
                      refresh();
                      if (meta && outside) {
                        const next = new Map(metaByName);
                        for (const k of [normName(name)]) {
                          next.set(k, { ...next.get(k), ...meta });
                        }
                      }
                    }
                  }}
                />
              ) : null}

              {!outsideCollection ? (
              <>
              <div className="flex flex-wrap gap-2 mb-3 justify-center">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTab(t);
                      setVisible(PAGE);
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                      tab === t ? TAB_CLASS[t].on : TAB_CLASS[t].off
                    }`}
                  >
                    {COLLECTION_BUCKET_LABELS[t]}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={cycleSort}
                  className="px-3 py-2 rounded-full border border-neutral-700 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 bg-neutral-900"
                >
                  Sort: {sortMode === "price" ? "Price" : "A–Z"}
                </button>
                <ManualCollectionColorFilter
                  selected={colorFilter}
                  locked={isCommanderFormatString(format)}
                  lockedColors={commanderColorPips}
                  onChange={setColorFilter}
                  onLockedPress={() => setColorLockToast(true)}
                />
              </div>

              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisible(PAGE);
                }}
                placeholder="Search cards…"
                autoComplete="off"
                className="w-full mb-3 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm"
              />

              <ul
                className="flex-1 overflow-y-auto space-y-2 min-h-[240px] max-h-[45vh] pr-1 mb-4"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
                    setVisible((v) => Math.min(tabRows.length, v + PAGE));
                  }
                }}
              >
                {visibleRows.length === 0 ? (
                  <li className="text-neutral-500 text-sm py-6 text-center">No cards in this tab.</li>
                ) : (
                  visibleRows.map((row) => {
                    const inDeck = draft.getQty(row.name);
                    const max = draft.maxAddAllowed(row.name, format, row.collectionQty, {
                      outsideCollection: false,
                    });
                    const rules = getFormatRules(format);
                    let capTotal = Math.min(row.collectionQty, rules.maxCopies);
                    if (rules.maxCopies === 1 && isBasicLandName(row.name)) {
                      capTotal = row.collectionQty;
                    }
                    return (
                      <ManualCollectionBrowseRow
                        key={row.id}
                        name={row.name}
                        meta={row.meta}
                        priceUsd={row.meta?.priceUsd}
                        inDeck={inDeck}
                        collectionQty={row.collectionQty}
                        capTotal={capTotal}
                        canAdd={max > 0}
                        onAdd={() => {
                          if (draft.addOne(row.name, format, row.collectionQty, { outsideCollection: false }))
                            refresh();
                        }}
                      />
                    );
                  })
                )}
              </ul>
              </>
              ) : null}

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Deck name (optional)"
                className="w-full mb-3 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm"
              />

              <p className="text-xs text-neutral-500 mb-3 text-center">{countHint}</p>
              {error ? <p className="text-sm text-red-400 mb-2 text-center">{error}</p> : null}

              {colorLockToast ? (
                <div
                  role="alert"
                  className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-950/95 text-sm text-neutral-100 text-center shadow-lg cursor-pointer"
                  onClick={() => setColorLockToast(false)}
                >
                  Colours locked to commander colours
                </div>
              ) : null}

              <div className="flex gap-3 sticky bottom-0 py-3 bg-neutral-950 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="px-4 py-3 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={saving || totalInDeck === 0}
                  onClick={() => void handleSave()}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold"
                >
                  {saving ? "Saving…" : "Save deck"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {showDiscardConfirm ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 max-w-sm w-full">
            <p className="text-white font-semibold mb-2">Discard this deck?</p>
            <p className="text-sm text-neutral-400 mb-4">Your picks will be lost.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-300"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => router.push(`/collections/${collectionId}`)}
                className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
