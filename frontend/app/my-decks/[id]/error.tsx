'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function MyDeckError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[My Deck Page Error]', error);
  }, [error]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🔧</div>
        <h1 className="text-2xl font-bold text-white mb-2">Unable to load your deck</h1>
        <p className="text-neutral-400 mb-6">
          We had trouble loading this deck. This might be a temporary issue.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium transition-all"
          >
            Try Again
          </button>
          <Link
            href="/my-decks"
            className="px-6 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-all border border-neutral-600"
          >
            Back to My Decks
          </Link>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs text-neutral-500">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
