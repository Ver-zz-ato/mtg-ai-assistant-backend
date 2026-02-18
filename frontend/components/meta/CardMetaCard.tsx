/**
 * CardMetaCard - Compact card for card list/grid (trending cards, most-played cards).
 * Shows image, name, inclusion stat, optional rank.
 * SSR-compatible.
 */

import Link from "next/link";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type CardMetaItem = {
  name: string;
  count: number;
  rank?: number;
};

type Props = {
  item: CardMetaItem;
  imageUrl?: string | null;
};

export function CardMetaCard({ item, imageUrl }: Props) {
  const slug = toSlug(item.name);

  return (
    <Link
      href={`/cards/${slug}`}
      className="group block rounded-xl bg-neutral-800/90 border border-neutral-700 hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 overflow-hidden"
    >
      <div className="aspect-[488/680] relative bg-neutral-800 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500 text-sm">
            No card
          </div>
        )}
        {item.rank != null && item.rank <= 5 && (
          <span className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white text-sm font-bold">
            #{item.rank}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
          {item.name}
        </h3>
        <p className="text-neutral-400 text-sm mt-1">
          {item.count.toLocaleString()} deck{item.count !== 1 ? "s" : ""}
        </p>
      </div>
    </Link>
  );
}
