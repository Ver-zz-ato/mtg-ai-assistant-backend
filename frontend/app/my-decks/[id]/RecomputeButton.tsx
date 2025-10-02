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
      className="text-xs border rounded px-2 py-1"
      title="Recalculate snapshot prices and refresh the page"
    >
      Recalculate prices
    </button>
  );
}