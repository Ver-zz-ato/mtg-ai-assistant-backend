'use client';

import React, { useEffect, useState } from 'react';

type ImageUrls = { small: string; normal: string };

export default function BlogCardImage({ name }: { name: string }) {
  const [img, setImg] = useState<ImageUrls | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImg(null);
    const tryFetch = (exact: boolean) => {
      const param = exact ? 'exact' : 'fuzzy';
      const url = `https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(name)}`;
      return fetch(url).then((r) => (r.ok ? r.json() : null));
    };
    tryFetch(true)
      .then((j: any) => {
        if (cancelled) return j;
        if (!j && name) return tryFetch(false);
        return j;
      })
      .then((j: any) => {
        if (cancelled || !j) return;
        const uris = j?.image_uris || j?.card_faces?.[0]?.image_uris || {};
        if (uris.small && uris.normal) {
          setImg({ small: uris.small, normal: uris.normal });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (loading || !img) {
    return (
      <span className="inline-block w-[70px] h-[98px] rounded bg-gray-200 dark:bg-gray-700 animate-pulse align-middle" />
    );
  }

  return (
    <span className="blog-card-image group relative inline-block align-middle ml-0.5 mr-1">
      <img
        src={img.small}
        alt={name}
        className="w-[70px] h-[98px] rounded border border-gray-300 dark:border-gray-600 shadow-sm cursor-pointer object-cover"
      />
      <span
        className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-50 pointer-events-none overflow-visible"
        aria-hidden
      >
        <span className="inline-block rounded-lg shadow-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-0.5">
          <img
            src={img.normal}
            alt={name}
            className="w-[244px] h-[340px] rounded-md object-contain"
          />
        </span>
      </span>
    </span>
  );
}
