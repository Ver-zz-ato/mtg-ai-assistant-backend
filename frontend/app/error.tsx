'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error Boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="rounded-2xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-xl">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-neutral-400 mb-6">
            We encountered an unexpected error. This has been logged and we&apos;ll look into it.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => reset()}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium transition-all"
            >
              Try Again
            </button>
            <a
              href="/"
              className="px-6 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-all border border-neutral-600"
            >
              Go Home
            </a>
          </div>
          {error.digest && (
            <p className="mt-4 text-xs text-neutral-500">
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
