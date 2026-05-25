"use client";

import React from "react";
import type { ImageInfo } from "@/lib/scryfall-cache";
import CardDetailLink from "@/components/cards/CardDetailLink";

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

  return (
    <CardDetailLink
      cardName={cardName}
      imageSmall={image?.small}
      imageNormal={imageUrl}
      title={`View ${cardName} card details`}
      className="inline rounded-sm text-sky-300 underline decoration-sky-300/50 decoration-dotted underline-offset-2 transition-colors hover:text-sky-100 hover:decoration-solid focus:outline-none focus:ring-1 focus:ring-sky-400/70"
      onPreview={onPreview}
      onClearPreview={onClearPreview}
    >
      {cardName}
    </CardDetailLink>
  );
}
