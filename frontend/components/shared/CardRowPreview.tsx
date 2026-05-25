"use client";
import React from "react";
import { useHoverPreview } from "@/components/shared/HoverPreview";
import { SetIcon, RarityPill } from "@/components/shared/SetRarity";
import CardDetailLink from "@/components/cards/CardDetailLink";

export default function CardRowPreviewLeft({
  name,
  imageSmall,
  imageLarge,
  setCode,
  rarity,
}: {
  name: string;
  imageSmall?: string;
  imageLarge?: string;
  setCode?: string;
  rarity?: string;
}){
  const { preview, bind } = useHoverPreview();
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      {imageSmall ? (
        <img src={imageSmall} alt={name} className="w-[24px] h-[34px] object-cover rounded flex-shrink-0" {...(bind(imageLarge||imageSmall) as any)} />
      ) : null}
      <CardDetailLink
        cardName={name}
        imageSmall={imageSmall}
        imageNormal={imageLarge || imageSmall}
        className="hover:underline truncate min-w-0 flex-1 text-left"
        title={name}
      >
        {name}
      </CardDetailLink>
      {(setCode || rarity) && (
        <span className="inline-flex items-center gap-1 flex-shrink-0">
          {setCode ? <SetIcon code={setCode} /> : null}
          {rarity ? <RarityPill rarity={rarity as any} /> : null}
        </span>
      )}
      {preview}
    </div>
  );
}
