"use client";
import React from "react";
import { useHoverPreview } from "@/components/shared/HoverPreview";
import { SetIcon, RarityPill } from "@/components/shared/SetRarity";

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
    <>
      {imageSmall ? (
        <img src={imageSmall} alt={name} className="w-[24px] h-[34px] object-cover rounded" {...(bind(imageLarge||imageSmall) as any)} />
      ) : null}
      <a className="hover:underline" href={`https://scryfall.com/search?q=!%22${encodeURIComponent(name)}%22`} target="_blank" rel="noreferrer">{name}</a>
      {(setCode || rarity) && (
        <span className="inline-flex items-center gap-1">
          {setCode ? <SetIcon code={setCode} /> : null}
          {rarity ? <RarityPill rarity={rarity as any} /> : null}
        </span>
      )}
      {preview}
    </>
  );
}
