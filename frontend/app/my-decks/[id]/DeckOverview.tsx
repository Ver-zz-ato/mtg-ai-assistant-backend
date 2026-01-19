// app/my-decks/[id]/DeckOverview.tsx
"use client";
import * as React from "react";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";

type DeckOverviewProps = {
  deckId: string;
  initialCommander: string | null;
  initialColors: string[];
  initialAim: string | null;
  format?: string;
  readOnly?: boolean; // If true, don't show edit buttons (for public deck pages)
  healthMetrics?: { lands: number; ramp: number; draw: number; removal: number } | null;
};

export default function DeckOverview({ 
  deckId, 
  initialCommander, 
  initialColors, 
  initialAim,
  format,
  readOnly = false,
  healthMetrics = null
}: DeckOverviewProps) {
  const [commander, setCommander] = React.useState(initialCommander || "");
  const [colors, setColors] = React.useState(initialColors || []);
  const [aim, setAim] = React.useState(initialAim || "");
  const [editingCommander, setEditingCommander] = React.useState(false);
  const [editingAim, setEditingAim] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [commanderImage, setCommanderImage] = React.useState<ImageInfo | null>(null);
  const [hoverImage, setHoverImage] = React.useState(false);

  // Update when initial values change
  React.useEffect(() => {
    setCommander(initialCommander || "");
    setColors(initialColors || []);
    setAim(initialAim || "");
  }, [initialCommander, initialColors, initialAim]);

  // Auto-infer deck aim if not set
  React.useEffect(() => {
    if (readOnly || format?.toLowerCase() !== 'commander') return;
    if (initialAim) return; // Don't infer if user has already set one
    
    // Wait a bit for deck to load, then infer
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/infer-aim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json().catch(() => ({}));
        if (json?.ok && json?.inferred && json?.aim) {
          setAim(json.aim);
          window.dispatchEvent(new Event('deck:changed'));
        }
      } catch (err) {
        // Silently fail
      }
    }, 1000); // Wait 1 second after mount

    return () => clearTimeout(timer);
  }, [deckId, initialAim, readOnly, format]);

  // Also infer when deck changes (cards added/removed)
  React.useEffect(() => {
    if (readOnly || format?.toLowerCase() !== 'commander') return;
    if (aim) return; // Don't re-infer if user has set one
    
    const handleDeckChange = async () => {
      // Debounce: wait 2 seconds after last change
      clearTimeout((window as any).__deckAimInferTimer);
      (window as any).__deckAimInferTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/decks/${deckId}/infer-aim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const json = await res.json().catch(() => ({}));
          if (json?.ok && json?.inferred && json?.aim) {
            setAim(json.aim);
          }
        } catch (err) {
          // Silently fail
        }
      }, 2000);
    };

    window.addEventListener('deck:changed', handleDeckChange);
    return () => {
      window.removeEventListener('deck:changed', handleDeckChange);
      clearTimeout((window as any).__deckAimInferTimer);
    };
  }, [deckId, aim, readOnly, format]);

  // Fetch commander image
  React.useEffect(() => {
    if (!commander) {
      setCommanderImage(null);
      return;
    }
    (async () => {
      try {
        const images = await getImagesForNames([commander]);
        const imageInfo = images.get(commander.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim());
        setCommanderImage(imageInfo || null);
      } catch (err) {
        setCommanderImage(null);
      }
    })();
  }, [commander]);

  async function saveCommander(newCommander: string) {
    const c = newCommander.trim();
    if (c === commander) return setEditingCommander(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/commander`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander: c }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setCommander(c);
      setEditingCommander(false);
      window.dispatchEvent(new Event('deck:changed'));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function onCommanderKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditingCommander(false);
      setCommander(initialCommander || "");
    }
  }

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
    <div className="rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-neutral-900/50 to-purple-950/20 p-3 shadow-md mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse"></div>
        <h3 className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Deck Overview
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Commander */}
        <div>
          <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide flex items-center justify-between">
            <span>Commander</span>
            {!readOnly && !editingCommander && (
              <button
                onClick={() => setEditingCommander(true)}
                className="text-blue-400 hover:text-blue-300 text-[10px] transition-colors flex items-center gap-0.5"
                title="Edit commander"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            )}
          </div>
          {editingCommander ? (
            <div className="flex flex-col">
              <input
                autoFocus
                defaultValue={commander}
                onBlur={(e) => saveCommander(e.currentTarget.value)}
                onKeyDown={onCommanderKey}
                disabled={busy}
                placeholder="Commander name"
                className="text-sm font-semibold bg-neutral-950 border border-neutral-700 rounded px-2 py-1 outline-none focus:border-blue-500"
              />
              {error && <span className="text-[10px] text-red-400 mt-0.5">{error}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {commanderImage?.small && (
                <div 
                  className="relative"
                  onMouseEnter={() => setHoverImage(true)}
                  onMouseLeave={() => setHoverImage(false)}
                >
                  <img 
                    src={commanderImage.small} 
                    alt={commander}
                    className="w-8 h-11 rounded border border-neutral-700 object-cover cursor-pointer hover:border-blue-400 transition-colors"
                  />
                  {hoverImage && commanderImage.normal && (
                    <div className="fixed z-50 pointer-events-none" style={{
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      maxWidth: '90vw',
                      maxHeight: '90vh'
                    }}>
                      <img 
                        src={commanderImage.normal} 
                        alt={commander}
                        className="w-48 h-64 rounded border-2 border-blue-500 shadow-2xl"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="text-sm font-semibold text-blue-400 flex-1">
                {commander || "Not set"}
              </div>
            </div>
          )}
        </div>

        {/* Colors - Read-only */}
        <div>
          <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide flex items-center gap-1">
            <span>Color Identity</span>
            <span className="text-[8px] opacity-50" title="From commander or deck metadata">(from Commander)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {colors.length > 0 ? (
              colors.map((c) => (
                <span
                  key={c}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${colorClasses[c] || 'bg-neutral-700 text-white'}`}
                >
                  {colorNames[c] || c}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-neutral-400 italic">No colors detected</span>
            )}
          </div>
        </div>

        {/* Aim/Goal */}
        <div>
          <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide flex items-center justify-between">
            <span>Deck Aim / Goal</span>
            {!readOnly && !editingAim && (
              <button
                onClick={() => setEditingAim(true)}
                className="text-blue-400 hover:text-blue-300 text-[10px] transition-colors flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20"
                title="Edit deck aim"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                placeholder="Deck strategy/goal..."
                rows={2}
                className="text-xs bg-neutral-950 border border-neutral-700 rounded px-2 py-1 outline-none focus:border-blue-500 resize-none"
              />
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[9px] text-neutral-500">Ctrl+Enter to save, Esc to cancel</span>
                {error && <span className="text-[9px] text-red-400">{error}</span>}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-200 min-h-[2.5rem] p-2 bg-neutral-950/50 rounded border border-neutral-800">
              {aim ? (
                <p className="whitespace-pre-wrap break-words">{aim}</p>
              ) : (
                <p className="text-neutral-500 italic text-[10px]">No aim/goal set. Click Edit to add one.</p>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Deck Health - Thin strip below Deck Identity */}
      {healthMetrics && format?.toLowerCase() === 'commander' && (() => {
        const { lands, ramp, draw, removal } = healthMetrics;
        const formatTargets = {
          lands: { min: 34, max: 38, current: lands },
          ramp: { min: 8, max: 8, current: ramp },
          draw: { min: 8, max: 8, current: draw },
          removal: { min: 5, max: 5, current: removal }
        };
        
        const getHealthStatus = (key: keyof typeof formatTargets) => {
          const t = formatTargets[key];
          if (t.current >= t.min && t.current <= t.max) return { icon: '🟢', label: 'solid', color: 'text-emerald-400' };
          if (t.current < t.min * 0.7) return { icon: '🔴', label: 'needs work', color: 'text-red-400' };
          return { icon: '🟡', label: 'slightly low', color: 'text-amber-400' };
        };
        
        const manaBase = getHealthStatus('lands');
        const interaction = getHealthStatus('removal');
        const cardDraw = getHealthStatus('draw');
        const winCondition = { icon: '🟢', label: 'clear', color: 'text-emerald-400' }; // Placeholder - could be calculated from deck
        
        const healthItems = [
          { label: 'Mana base', status: manaBase },
          { label: 'Interaction', status: interaction },
          { label: 'Card draw', status: cardDraw },
          { label: 'Win condition', status: winCondition }
        ];
        
        return (
          <div className="mt-3 pt-3 border-t border-blue-500/20">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Deck Health
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {healthItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    // Trigger AI Assistant to expand with suggestion
                    try {
                      window.dispatchEvent(new CustomEvent('deck:health-click', { 
                        detail: { 
                          category: item.label.toLowerCase().replace(/\s+/g, '_'),
                          label: item.label,
                          status: item.status.label
                        } 
                      }));
                      // Also trigger AI Assistant to open
                      window.dispatchEvent(new CustomEvent('ai-assistant:open', { 
                        detail: { 
                          context: 'health_warning',
                          category: item.label.toLowerCase().replace(/\s+/g, '_'),
                          message: `${item.label} ${item.status.label} - Get AI suggestions to improve this`
                        } 
                      }));
                    } catch {}
                  }}
                  className={`flex flex-col items-start gap-1 p-2 rounded-lg border transition-all cursor-pointer group ${
                    item.status.icon === '🔴' 
                      ? 'bg-red-950/30 border-red-500/40 hover:border-red-400/60 hover:bg-red-950/40' 
                      : item.status.icon === '🟡'
                      ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-400/50 hover:bg-amber-950/30'
                      : 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400/50 hover:bg-emerald-950/30'
                  }`}
                  title={`${item.label}: ${item.status.label}. Click for AI suggestions.`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-base">{item.status.icon}</span>
                    <span className={`text-xs font-medium ${item.status.color} group-hover:opacity-90`}>{item.label}</span>
                  </div>
                  <span className={`text-[10px] ${item.status.color} opacity-80 group-hover:opacity-100`}>{item.status.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
