"use client";

import React from "react";
import type { ImageInfo } from "@/lib/scryfall-cache";

export function scryfallCardSearchUrl(cardName: string): string {
  const name = String(cardName || "").trim();
  const query = name ? `!"${name}"` : "";
  const params = new URLSearchParams({
    q: query,
    unique: "cards",
    as: "grid",
    order: "name",
  });
  return `https://scryfall.com/search?${params.toString()}`;
}

type InlineCardLinkProps = {
  cardName: string;
  image?: ImageInfo;
  onPreview: (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, cardName: string, imageUrl: string) => void;
  onClearPreview: () => void;
};

export default function InlineCardLink({
  cardName,
  image,
  onPreview,
  onClearPreview,
}: InlineCardLinkProps) {
  const imageUrl = image?.normal || image?.art_crop || image?.small;

  const showPreview = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    if (imageUrl) onPreview(event, cardName, imageUrl);
  };

  return (
    <a
      href={scryfallCardSearchUrl(cardName)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${cardName} on Scryfall`}
      className="inline rounded-sm text-sky-300 underline decoration-sky-300/50 decoration-dotted underline-offset-2 transition-colors hover:text-sky-100 hover:decoration-solid focus:outline-none focus:ring-1 focus:ring-sky-400/70"
      onMouseEnter={showPreview}
      onFocus={showPreview}
      onMouseLeave={onClearPreview}
      onBlur={onClearPreview}
    >
      {cardName}
    </a>
  );
}
