'use client';

import { useEffect } from 'react';

export default function CollectionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Collections Error]', error);
  }, [error]);

  return (
    <main className="mx-auto max-w-5xl p-6" role="alert">
      <h1 className="text-xl font-semibold text-white mb-2">Could not load collections</h1>
      <p className="text-neutral-400 mb-4">{error.message || 'Something went wrong'}</p>
      <button onClick={() => reset()} className="px-4 py-2 rounded bg-neutral-800 text-white text-sm">
        Try again
      </button>
    </main>
  );
}
