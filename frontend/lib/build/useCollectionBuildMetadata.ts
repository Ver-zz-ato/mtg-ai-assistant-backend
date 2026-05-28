"use client";

import { useCallback, useEffect, useState } from "react";
import { isCommanderCandidateMeta } from "@/lib/build/commanderCandidate";
import {
  normalizeScryfallCacheName,
  resolveMetaFromMap,
  scryfallCacheLookupNameKeys,
} from "@/lib/scryfall-cache-lookup";
import type { CardBucketMeta } from "./collectionCardBucket";

export type CollectionBuildItem = {
  id: string;
  name: string;
  qty: number;
};

export type CollectionCardMeta = CardBucketMeta & {
  color_identity?: string[] | null;
  oracle_text?: string | null;
  priceUsd?: number;
  metaLoaded?: boolean;
  imageSmall?: string;
  imageNormal?: string;
  set?: string;
  rarity?: string;
};

function applyMetaRow(
  meta: Map<string, CollectionCardMeta>,
  requestName: string,
  row: Record<string, unknown>,
  priceUsd?: number,
): void {
  const uris = row.image_uris as { small?: string; normal?: string } | undefined;
  const payload: CollectionCardMeta = {
    type_line: (row.type_line as string) ?? null,
    oracle_text: (row.oracle_text as string) ?? null,
    color_identity: Array.isArray(row.color_identity)
      ? (row.color_identity as string[]).map((c) => String(c).toUpperCase())
      : null,
    is_land: row.is_land as boolean | null | undefined,
    is_creature: row.is_creature as boolean | null | undefined,
    is_instant: row.is_instant as boolean | null | undefined,
    is_sorcery: row.is_sorcery as boolean | null | undefined,
    is_enchantment: row.is_enchantment as boolean | null | undefined,
    is_artifact: row.is_artifact as boolean | null | undefined,
    is_planeswalker: row.is_planeswalker as boolean | null | undefined,
    priceUsd,
    imageSmall: uris?.small,
    imageNormal: uris?.normal,
    set: (row.set as string) || undefined,
    rarity: (row.rarity as string) || undefined,
    metaLoaded: true,
  };
  if (Array.isArray(row.color_identity)) {
    payload.color_identity = (row.color_identity as string[]).map((c) => String(c).toUpperCase());
  }
  for (const key of scryfallCacheLookupNameKeys(requestName)) {
    meta.set(key, { ...meta.get(key), ...payload });
  }
}

export function useCollectionBuildMetadata(collectionId: string | null) {
  const [items, setItems] = useState<CollectionBuildItem[]>([]);
  const [metaByName, setMetaByName] = useState<Map<string, CollectionCardMeta>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaCoverage, setMetaCoverage] = useState({ loaded: 0, total: 0 });

  const normName = normalizeScryfallCacheName;

  const load = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load collection");
      const loaded: CollectionBuildItem[] = (json.items || []).map(
        (i: { id: string; name: string; qty: number }) => ({
          id: String(i.id),
          name: String(i.name),
          qty: Number(i.qty) || 1,
        }),
      );
      setItems(loaded);

      const names = [...new Set(loaded.map((i) => i.name))];
      const meta = new Map<string, CollectionCardMeta>();
      const chunkSize = 100;
      let loadedMetaCount = 0;
      const chunkPromises: Promise<void>[] = [];

      for (let i = 0; i < names.length; i += chunkSize) {
        const chunk = names.slice(i, i + chunkSize);
        chunkPromises.push(
          (async () => {
        const [metaRes, imgRes, priceRes] = await Promise.all([
          fetch("/api/cards/batch-metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: chunk }),
          }),
          fetch("/api/cards/batch-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: chunk }),
          }),
          fetch("/api/price/snapshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: chunk, currency: "USD" }),
          }),
        ]);
        const metaJson = await metaRes.json().catch(() => ({}));
        const imgJson = await imgRes.json().catch(() => ({}));
        const priceJson = await priceRes.json().catch(() => ({}));
        const prices: Record<string, number> =
          priceRes.ok && priceJson?.ok ? priceJson.prices || {} : {};

        const dataArr: Array<Record<string, unknown>> =
          metaRes.ok && Array.isArray(metaJson?.data) ? metaJson.data : [];
        const foundNames = new Set<string>();
        for (const row of dataArr) {
          const name = String(row.name || "");
          if (!name) continue;
          foundNames.add(name);
          const priceKey = normalizeScryfallCacheName(name);
          applyMetaRow(meta, name, row, prices[priceKey] ?? prices[normName(name)]);
        }
        loadedMetaCount += foundNames.size;

        const imgData: Array<{ name?: string; image_uris?: { small?: string; normal?: string } }> =
          imgRes.ok && imgJson?.data ? imgJson.data : [];
        for (const card of imgData) {
          const name = String(card.name || "");
          if (!name) continue;
          for (const key of scryfallCacheLookupNameKeys(name)) {
            const prev = meta.get(key) || {};
            meta.set(key, {
              ...prev,
              imageSmall: prev.imageSmall || card.image_uris?.small,
              imageNormal: prev.imageNormal || card.image_uris?.normal,
            });
          }
        }
          })(),
        );
      }

      await Promise.all(chunkPromises);

      setMetaByName(meta);
      setMetaCoverage({ loaded: loadedMetaCount, total: names.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const commanderCandidates = items.filter((item) => {
    const m = resolveMetaFromMap(metaByName, item.name);
    return isCommanderCandidateMeta(m);
  });

  const fetchMetaForName = useCallback(async (name: string): Promise<CollectionCardMeta | undefined> => {
    const existing = resolveMetaFromMap(metaByName, name);
    if (existing?.metaLoaded) return existing;
    try {
      const res = await fetch("/api/cards/batch-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: [name] }),
      });
      const json = await res.json();
      const row = Array.isArray(json?.data) ? json.data[0] : null;
      if (!row) return existing;
      const next = new Map(metaByName);
      applyMetaRow(next, name, row as Record<string, unknown>);
      setMetaByName(next);
      return resolveMetaFromMap(next, name);
    } catch {
      return existing;
    }
  }, [metaByName]);

  return {
    items,
    metaByName,
    loading,
    error,
    reload: load,
    commanderCandidates,
    normName,
    metaCoverage,
    resolveMeta: (name: string) => resolveMetaFromMap(metaByName, name),
    fetchMetaForName,
  };
}
