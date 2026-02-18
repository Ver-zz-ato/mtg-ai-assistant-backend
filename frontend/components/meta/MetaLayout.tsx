/**
 * Meta Layout - Consistent wrapper for all meta pages.
 * Provides max-width container, vertical spacing, and subtle background gradient.
 * SSR-compatible.
 */

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional: narrower max-width for list-heavy pages */
  narrow?: boolean;
};

export function MetaLayout({ children, narrow = false }: Props) {
  return (
    <div className="relative min-h-[60vh]">
      {/* Subtle dark gradient overlay behind main content */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-neutral-950/40 via-transparent to-neutral-950/30"
        aria-hidden
      />
      <main
        className={`w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 ${
          narrow ? "max-w-4xl" : "max-w-[1200px]"
        }`}
      >
        <div className="space-y-8">{children}</div>
      </main>
    </div>
  );
}
