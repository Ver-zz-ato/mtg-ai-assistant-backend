"use client";

import {
  COLLECTION_WUBRG,
  type CollectionColorPip,
  toggleColorPip,
} from "@/lib/build/collectionColorFilter";

const MANA_HEX: Record<CollectionColorPip, string> = {
  W: "#F8F6D8",
  U: "#4F8CFF",
  B: "#1C1C1C",
  R: "#E5533D",
  G: "#2ECC71",
};

type Props = {
  selected: CollectionColorPip[];
  locked?: boolean;
  lockedColors?: CollectionColorPip[];
  onChange: (next: CollectionColorPip[]) => void;
  onLockedPress?: () => void;
};

export default function ManualCollectionColorFilter({
  selected,
  locked = false,
  lockedColors = [],
  onChange,
  onLockedPress,
}: Props) {
  const lit = locked ? lockedColors : selected;

  const onPip = (pip: CollectionColorPip) => {
    if (locked) {
      onLockedPress?.();
      return;
    }
    onChange(toggleColorPip(selected, pip));
  };

  const onAll = () => {
    if (locked) {
      onLockedPress?.();
      return;
    }
    onChange([]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onAll}
        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
          !locked && selected.length === 0
            ? "border-blue-500/60 bg-blue-950/40 text-blue-200"
            : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
        } ${locked ? "opacity-55 cursor-default" : ""}`}
      >
        All
      </button>
      {COLLECTION_WUBRG.map((pip) => {
        const on = lit.includes(pip);
        return (
          <button
            key={pip}
            type="button"
            onClick={() => onPip(pip)}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
              on
                ? "border-blue-500 bg-blue-950/30 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                : "border-neutral-700 bg-neutral-900 opacity-90 hover:border-neutral-500"
            } ${locked && !on ? "opacity-30" : ""}`}
            aria-pressed={on}
            aria-disabled={locked}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                pip === "B" ? "ring-1 ring-white/20" : ""
              }`}
              style={{
                backgroundColor: MANA_HEX[pip],
                color: pip === "W" ? "#1a1a1a" : pip === "G" ? "#0a1a0f" : "#fff",
                opacity: on ? 1 : 0.45,
              }}
            >
              {pip}
            </span>
          </button>
        );
      })}
    </div>
  );
}
