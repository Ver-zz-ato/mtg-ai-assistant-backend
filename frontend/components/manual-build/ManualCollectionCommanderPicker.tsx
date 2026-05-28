"use client";

import { useMemo, useState } from "react";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import type { CollectionBuildItem, CollectionCardMeta } from "@/lib/build/useCollectionBuildMetadata";
import { sortCollectionCards } from "@/lib/build/sortCollectionCards";
import OutsideCollectionToggle from "./OutsideCollectionToggle";
import OutsideCardSearchAdd from "./OutsideCardSearchAdd";

const PAGE = 5;

interface ManualCollectionCommanderPickerProps {
  candidates: CollectionBuildItem[];
  metaByName: Map<string, CollectionCardMeta>;
  normName: (n: string) => string;
  selectedCommander: string;
  onSelect: (name: string, meta?: CollectionCardMeta) => void;
  onContinue: () => void;
  onBack: () => void;
  loading?: boolean;
  metaCoverage?: { loaded: number; total: number };
}

export default function ManualCollectionCommanderPicker({
  candidates,
  metaByName,
  normName,
  selectedCommander,
  onSelect,
  onContinue,
  onBack,
  loading,
  metaCoverage,
}: ManualCollectionCommanderPickerProps) {
  const [filter, setFilter] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [outsideCollection, setOutsideCollection] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = sortCollectionCards(
      candidates.map((c) => {
        const m = metaByName.get(normName(c.name));
        return { name: c.name, qty: c.qty, priceUsd: m?.priceUsd, color_identity: m?.color_identity };
      }),
      "name",
    );
    let filteredRows = rows;
    if (q) filteredRows = filteredRows.filter((r) => r.name.toLowerCase().includes(q));
    return filteredRows;
  }, [candidates, filter, metaByName, normName]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <OutsideCollectionToggle checked={outsideCollection} onChange={setOutsideCollection} />

      {outsideCollection ? (
        <OutsideCardSearchAdd
          commanderOnly
          onPick={(name, meta) => onSelect(name, meta)}
          placeholder="Search any commander…"
        />
      ) : null}

      {!outsideCollection ? (
        <>
          <p className="text-sm text-neutral-400 mb-1">
            Pick a commander from cards you own in this collection.
          </p>
          {metaCoverage && metaCoverage.total > 0 ? (
            <p className="text-xs text-neutral-500 mb-3">
              Card data loaded for {metaCoverage.loaded} of {metaCoverage.total} unique names
              {candidates.length > 0 ? ` · ${candidates.length} commander-eligible` : ""}.
            </p>
          ) : null}
          <input
            type="search"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setVisible(PAGE);
            }}
            placeholder="Filter your commanders…"
            autoComplete="off"
            className="w-full mb-4 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm"
          />
          {loading ? (
            <p className="text-neutral-400 text-sm py-6">Loading collection card data…</p>
          ) : candidates.length === 0 ? (
            <p className="text-neutral-500 text-sm">
              No commander-eligible cards found in this collection yet. Try{" "}
              <strong className="text-neutral-300">Pick from outside collection</strong> above, or add
              legendary creatures to the collection first.
            </p>
          ) : (
            <ul
              className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[50vh] pr-1"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
                  setVisible((v) => Math.min(filtered.length, v + PAGE));
                }
              }}
            >
              {shown.map((row) => {
                const m = metaByName.get(normName(row.name));
                const on = selectedCommander === row.name;
                return (
                  <li key={row.name}>
                    <button
                      type="button"
                      onClick={() => onSelect(row.name, m)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                        on
                          ? "border-purple-500 bg-purple-950/40"
                          : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-600"
                      }`}
                    >
                      <CardRowPreviewLeft
                        name={row.name}
                        imageSmall={m?.imageSmall}
                        imageLarge={m?.imageNormal}
                        setCode={m?.set}
                        rarity={m?.rarity}
                      />
                      {on ? (
                        <span className="text-xs font-semibold text-purple-300 shrink-0">Selected</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : selectedCommander ? (
        <p className="text-sm text-purple-300 mb-4">
          Selected: <strong>{selectedCommander}</strong>
        </p>
      ) : null}

      <div className="flex gap-3 mt-4 pt-4 border-t border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!selectedCommander.trim()}
          onClick={onContinue}
          className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold"
        >
          Continue to deck builder
        </button>
      </div>
    </div>
  );
}
