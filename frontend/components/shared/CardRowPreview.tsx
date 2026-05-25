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
  const hoverBind = imageLarge || imageSmall ? bind(imageLarge || imageSmall || "") : {};
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1" {...(hoverBind as any)}>
      {imageSmall ? (
        <img src={imageSmall} alt={name} className="w-8 h-[45px] object-cover rounded flex-shrink-0 border border-white/10 bg-neutral-900" />
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
