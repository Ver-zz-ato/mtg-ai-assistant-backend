"use client";

import Link from "next/link";

type Props = {
  format: string;
  currentCardCount: number;
  expectedCardCount: number;
  workshopMinimumCards: number;
  deckId?: string;
};

export function WorkshopIncompleteGate({
  format,
  currentCardCount,
  expectedCardCount,
  workshopMinimumCards,
  deckId,
}: Props) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
      <h2 className="text-lg font-bold text-white">Finish the draft first</h2>
      <p className="mt-2 text-sm text-neutral-300">
        AI Workshop works best once you&apos;re at least halfway to a full {format} list. You currently
        have {currentCardCount} of {expectedCardCount} cards loaded.
      </p>
      <p className="mt-2 text-sm text-neutral-400">
        Come back once this deck reaches {workshopMinimumCards}+ cards for targeted refinement passes
        like curve, budget, or legality.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {deckId ? (
          <Link
            href={`/my-decks/${deckId}`}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 touch-manipulation"
          >
            Back to deck
          </Link>
        ) : null}
        <Link
          href="/collections/cost-to-finish"
          className="inline-flex min-h-[40px] items-center rounded-lg border border-neutral-600 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 touch-manipulation"
        >
          Cost to finish
        </Link>
      </div>
    </div>
  );
}
