"use client";

import CardDetailLink from "@/components/cards/CardDetailLink";

type GuideInlineTextProps = {
  text: string;
};

export function GuideInlineText({ text }: GuideInlineTextProps) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);

  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[\[([^\]]+)\]\]$/);
        if (!match) return <span key={index}>{part}</span>;
        const cardName = match[1].trim();
        return (
          <CardDetailLink
            key={index}
            cardName={cardName}
            title={`View ${cardName} card details`}
            className="inline rounded-sm text-sky-300 underline decoration-sky-300/50 decoration-dotted underline-offset-2 transition-colors hover:text-sky-100 hover:decoration-solid"
          >
            {cardName}
          </CardDetailLink>
        );
      })}
    </>
  );
}
