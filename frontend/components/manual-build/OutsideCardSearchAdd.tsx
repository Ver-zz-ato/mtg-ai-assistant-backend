"use client";

import { useState } from "react";
import CardAutocomplete from "@/components/CardAutocomplete";
import type { CollectionCardMeta } from "@/lib/build/useCollectionBuildMetadata";

interface OutsideCardSearchAddProps {
  commanderOnly?: boolean;
  onPick: (name: string, meta?: CollectionCardMeta) => void;
  placeholder?: string;
}

export default function OutsideCardSearchAdd({
  commanderOnly = false,
  onPick,
  placeholder,
}: OutsideCardSearchAddProps) {
  const [query, setQuery] = useState("");

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
      <p className="text-xs text-amber-200/90 mb-2">
        Search all {commanderOnly ? "commanders" : "cards"} on Scryfall — not limited to your collection.
      </p>
      <CardAutocomplete
        value={query}
        onChange={setQuery}
        placeholder={placeholder ?? (commanderOnly ? "Search any commander…" : "Search any card…")}
        searchUrl={commanderOnly ? "/api/cards/search-commanders" : "/api/cards/search"}
        onPick={async (name) => {
          setQuery("");
          let meta: CollectionCardMeta | undefined;
          try {
            const res = await fetch("/api/cards/batch-metadata", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ names: [name] }),
            });
            const json = await res.json();
            const row = Array.isArray(json?.data) ? json.data[0] : null;
            if (row) {
              meta = {
                type_line: row.type_line,
                oracle_text: row.oracle_text,
                color_identity: row.color_identity,
                imageSmall: row.image_uris?.small,
                imageNormal: row.image_uris?.normal,
                metaLoaded: true,
              };
            }
          } catch {
            // ignore
          }
          onPick(name, meta);
        }}
      />
    </div>
  );
}
