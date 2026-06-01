"use client";

import React from "react";
import { createPortal } from "react-dom";
import WebsiteCardDetailModal from "@/components/cards/WebsiteCardDetailModal";

type CardDetailLinkProps = {
  cardName: string;
  imageSmall?: string;
  imageNormal?: string;
  className?: string;
  title?: string;
  children?: React.ReactNode;
  onPreview?: (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, cardName: string, imageUrl: string) => void;
  onClearPreview?: () => void;
};

export default function CardDetailLink({
  cardName,
  imageSmall,
  imageNormal,
  className,
  title,
  children,
  onPreview,
  onClearPreview,
}: CardDetailLinkProps) {
  const [open, setOpen] = React.useState(false);
  const imageUrl = imageNormal || imageSmall;

  const showPreview = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    if (imageUrl) onPreview?.(event, cardName, imageUrl);
  };

  return (
    <>
      <button
        type="button"
        title={title || `View ${cardName} card details`}
        className={className}
        onClick={() => {
          onClearPreview?.();
          setOpen(true);
        }}
        onMouseEnter={showPreview}
        onFocus={showPreview}
        onMouseLeave={onClearPreview}
        onBlur={onClearPreview}
      >
        {children ?? cardName}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <WebsiteCardDetailModal
              open={open}
              cardName={cardName}
              imageSmall={imageSmall}
              imageNormal={imageNormal}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
