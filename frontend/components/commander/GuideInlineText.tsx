function scryfallCardSearchUrl(cardName: string): string {
  const params = new URLSearchParams({
    q: `!"${cardName.trim()}"`,
    unique: "cards",
    as: "grid",
    order: "name",
  });
  return `https://scryfall.com/search?${params.toString()}`;
}

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
          <a
            key={index}
            href={scryfallCardSearchUrl(cardName)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${cardName} on Scryfall`}
            className="inline rounded-sm text-sky-300 underline decoration-sky-300/50 decoration-dotted underline-offset-2 transition-colors hover:text-sky-100 hover:decoration-solid"
          >
            {cardName}
          </a>
        );
      })}
    </>
  );
}
