"use client";

import React from "react";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";

type CardListRow = {
  name: string;
  edhrecRank: number | null;
  rank: number;
  price: string | null;
  imageSmall?: string;
  imageLarge?: string;
  setCode?: string;
  rarity?: string;
};

const PAGE_SIZE = 20;

export default function CardsInfiniteList({ cards }: { cards: CardListRow[] }) {
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const hasMore = visibleCount < cards.length;
  const visibleCards = React.useMemo(
    () => cards.slice(0, visibleCount),
    [cards, visibleCount]
  );

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [cards]);

  React.useEffect(() => {
    const root = scrollerRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, cards.length));
      },
      {
        root,
        threshold: 0.1,
        rootMargin: "0px 0px 160px 0px",
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [cards.length, hasMore]);

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/70">
      <div className="border-b border-white/10 px-3 py-2 text-xs text-neutral-400">
        Showing {visibleCards.length} of {cards.length}
      </div>
      <div ref={scrollerRef} className="max-h-[70vh] overflow-y-auto">
        <ol>
          {visibleCards.map((c) => (
            <li
              key={c.name}
              className="grid gap-3 border-b border-white/10 px-3 py-3 last:border-b-0 sm:grid-cols-[56px_minmax(0,1fr)_130px_110px] sm:items-center"
            >
              <span className="text-sm font-semibold tabular-nums text-neutral-500">
                #{c.rank}
              </span>
              <CardRowPreviewLeft
                name={c.name}
                imageSmall={c.imageSmall}
                imageLarge={c.imageLarge}
                setCode={c.setCode}
                rarity={c.rarity}
              />
              <span className="text-sm text-neutral-400">
                {c.edhrecRank ? `EDHREC #${c.edhrecRank.toLocaleString()}` : "Global meta"}
              </span>
              <span className="text-sm font-semibold text-emerald-200">
                {c.price ?? "Price n/a"}
              </span>
            </li>
          ))}
        </ol>
        {hasMore ? (
          <div ref={sentinelRef} className="px-3 py-4 text-center text-sm text-neutral-400">
            Scroll for 20 more
          </div>
        ) : null}
      </div>
    </div>
  );
}
