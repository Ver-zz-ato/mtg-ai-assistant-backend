"use client";

import { useCallback, useEffect, useState } from "react";
import { isCommanderEligible } from "@/lib/deck/deck-enrichment";
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
  imageSmall?: string;
  imageNormal?: string;
  set?: string;
  rarity?: string;
};

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useCollectionBuildMetadata(collectionId: string | null) {
  const [items, setItems] = useState<CollectionBuildItem[]>([]);
  const [metaByName, setMetaByName] = useState<Map<string, CollectionCardMeta>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const chunkSize = 120;
      for (let i = 0; i < names.length; i += chunkSize) {
        const chunk = names.slice(i, i + chunkSize);
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
        const dataArr: Array<Record<string, unknown>> = metaRes.ok && Array.isArray(metaJson?.data) ? metaJson.data : [];
        for (const row of dataArr) {
          const name = String(row.name || "");
          if (!name) continue;
          const key = norm(name);
          const uris = row.image_uris as { small?: string; normal?: string } | undefined;
          meta.set(key, {
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
            priceUsd: prices[key] ?? prices[norm(name)],
            imageSmall: uris?.small,
            imageNormal: uris?.normal,
            set: (row.set as string) || undefined,
            rarity: (row.rarity as string) || undefined,
          });
        }
        const imgData: Array<{ name?: string; image_uris?: { small?: string; normal?: string } }> =
          imgRes.ok && imgJson?.data ? imgJson.data : [];
        for (const card of imgData) {
          const name = String(card.name || "");
          if (!name) continue;
          const key = norm(name);
          const prev = meta.get(key) || {};
          meta.set(key, {
            ...prev,
            imageSmall: prev.imageSmall || card.image_uris?.small,
            imageNormal: prev.imageNormal || card.image_uris?.normal,
          });
        }
      }
      setMetaByName(meta);
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
    const m = metaByName.get(norm(item.name));
    return isCommanderEligible(m?.type_line ?? undefined, m?.oracle_text ?? undefined);
  });

  return {
    items,
    metaByName,
    loading,
    error,
    reload: load,
    commanderCandidates,
    normName: norm,
  };
}
