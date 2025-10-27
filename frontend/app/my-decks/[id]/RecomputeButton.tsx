"use client";

export default function RecomputeButton() {
  return (
    <button
      onClick={() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('r', String(Date.now()));
          window.location.href = url.toString();
        } catch {
          // noop
        }
      }}
      className="text-xs border border-rose-500/50 bg-rose-600/20 hover:bg-rose-600/40 rounded px-3 py-1.5 transition-all font-medium"
      title="Recalculate snapshot prices and refresh the page"
    >
      Recalculate prices
    </button>
  );
}