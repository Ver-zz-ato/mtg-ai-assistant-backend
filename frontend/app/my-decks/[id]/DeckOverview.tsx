// app/my-decks/[id]/DeckOverview.tsx
"use client";
import * as React from "react";

type DeckOverviewProps = {
  deckId: string;
  initialCommander: string | null;
  initialColors: string[];
  initialAim: string | null;
  format?: string;
  readOnly?: boolean; // If true, don't show edit buttons (for public deck pages)
};

export default function DeckOverview({ 
  deckId, 
  initialCommander, 
  initialColors, 
  initialAim,
  format,
  readOnly = false
}: DeckOverviewProps) {
  const [commander, setCommander] = React.useState(initialCommander || "");
  const [colors, setColors] = React.useState(initialColors || []);
  const [aim, setAim] = React.useState(initialAim || "");
  const [editingAim, setEditingAim] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Update when initial values change
  React.useEffect(() => {
    setCommander(initialCommander || "");
    setColors(initialColors || []);
    setAim(initialAim || "");
  }, [initialCommander, initialColors, initialAim]);

  async function saveAim(newAim: string) {
    const a = newAim.trim();
    if (a === aim) return setEditingAim(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck_aim: a || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setAim(a);
      setEditingAim(false);
      window.dispatchEvent(new Event('deck:changed'));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditingAim(false);
      setAim(initialAim || "");
    }
  }

  const colorNames: Record<string, string> = {
    'W': 'White',
    'U': 'Blue',
    'B': 'Black',
    'R': 'Red',
    'G': 'Green'
  };

  const colorClasses: Record<string, string> = {
    'W': 'bg-gray-200 text-gray-900',
    'U': 'bg-blue-400 text-blue-900',
    'B': 'bg-gray-600 text-white',
    'R': 'bg-red-500 text-white',
    'G': 'bg-green-500 text-white'
  };

  // Only show for Commander format
  if (format?.toLowerCase() !== 'commander') {
    return null;
  }

  return (
    <div className="rounded-xl border-2 border-blue-500/50 bg-gradient-to-br from-blue-950/30 via-neutral-900 to-purple-950/30 p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shadow-lg shadow-blue-400/50"></div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Deck Overview
        </h2>
      </div>

      <div className="space-y-4">
        {/* Commander */}
        <div>
          <div className="text-xs opacity-70 mb-1.5 uppercase tracking-wide">Commander</div>
          <div className="text-lg font-semibold text-blue-400">
            {commander || "Not set"}
          </div>
        </div>

        {/* Colors */}
        <div>
          <div className="text-xs opacity-70 mb-1.5 uppercase tracking-wide">Color Identity</div>
          <div className="flex flex-wrap gap-2">
            {colors.length > 0 ? (
              colors.map((c) => (
                <span
                  key={c}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${colorClasses[c] || 'bg-neutral-700 text-white'}`}
                >
                  {colorNames[c] || c}
                </span>
              ))
            ) : (
              <span className="text-sm text-neutral-400 italic">No colors detected</span>
            )}
          </div>
        </div>

        {/* Aim/Goal */}
        <div>
          <div className="text-xs opacity-70 mb-1.5 uppercase tracking-wide flex items-center justify-between">
            <span>Deck Aim / Goal</span>
            {!readOnly && !editingAim && (
              <button
                onClick={() => setEditingAim(true)}
                className="text-blue-400 hover:text-blue-300 text-xs transition-colors flex items-center gap-1"
                title="Edit deck aim"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            )}
          </div>
          {editingAim ? (
            <div className="flex flex-col">
              <textarea
                autoFocus
                defaultValue={aim}
                onBlur={(e) => saveAim(e.currentTarget.value)}
                onKeyDown={onKey}
                disabled={busy}
                placeholder="Describe your deck's strategy, win condition, or goal (e.g., 'Token swarm with aristocrats payoffs', 'Control with planeswalker ultimates')"
                rows={3}
                className="text-sm bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Press Ctrl+Enter or click outside to save, Esc to cancel</span>
                {error && <span className="text-xs text-red-400">{error}</span>}
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-200 min-h-[3rem] p-3 bg-neutral-950/50 rounded-lg border border-neutral-800">
              {aim ? (
                <p className="whitespace-pre-wrap">{aim}</p>
              ) : (
                <p className="text-neutral-500 italic">No aim/goal set. Click Edit to add one.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
