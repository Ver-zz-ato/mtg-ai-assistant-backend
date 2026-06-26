// app/my-decks/[id]/DeckOverview.tsx
"use client";
import * as React from "react";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";
import { validatePublicText } from "@/lib/profanity";
import DeckPriceMini from "@/components/DeckPriceMini";

type DeckOverviewProps = {
  deckId: string;
  initialCommander: string | null;
  initialColors: string[];
  initialAim: string | null;
  format?: string;
  readOnly?: boolean; // If true, don't show edit buttons (for public deck pages)
  healthMetrics?: { lands: number; ramp: number; draw: number; removal: number } | null;
  isPro?: boolean; // Pro status for gating deck health features
  typeBreakdown?: Record<string, number>;
  playstyleRadar?: Record<string, number>;
  curveBreakdown?: Record<string, number>;
  archetypeLabels?: string[];
};

export default function DeckOverview({ 
  deckId, 
  initialCommander, 
  initialColors, 
  initialAim,
  format,
  readOnly = false,
  healthMetrics: _healthMetrics = null,
  isPro: _isPro = false,
  typeBreakdown,
  playstyleRadar,
  curveBreakdown,
  archetypeLabels = []
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
  const [curveOpen, setCurveOpen] = React.useState(true);
  const [typesOpen, setTypesOpen] = React.useState(true);
  const [radarOpen, setRadarOpen] = React.useState(true);
  const isCommander = String(format || "").toLowerCase() === "commander";

  // Update when initial values change
  React.useEffect(() => {
    setCommander(initialCommander || "");
    setColors(initialColors || []);
    setAim(initialAim || "");
  }, [initialCommander, initialColors, initialAim]);

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
      } catch {
        setCommanderImage(null);
      }
    })();
  }, [commander]);

  // Auto-detect colors if commander is set but colors are missing
  React.useEffect(() => {
    if (readOnly) return;
    if (!commander || colors.length > 0) return;
    
    // Trigger a re-save of commander to fetch colors (API now returns colors)
    const detectColors = async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/commander`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commander }),
        });
        const json = await res.json().catch(() => ({}));
        if (json?.ok && Array.isArray(json?.colors) && json.colors.length > 0) {
          setColors(json.colors);
        }
      } catch {
        // Silently fail - non-critical
      }
    };
    
    // Debounce to avoid multiple calls
    const timer = setTimeout(detectColors, 500);
    return () => clearTimeout(timer);
  }, [deckId, commander, colors.length, readOnly]);

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
      // Update colors if returned from API (auto-detected from commander)
      if (Array.isArray(json?.colors)) {
        setColors(json.colors);
      }
      setEditingCommander(false);
      window.dispatchEvent(new Event('deck:changed'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
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
    const aimCheck = validatePublicText(a, "Deck aim");
    if (!aimCheck.ok) {
      setError(aimCheck.message);
      return;
    }
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
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

  const manaClasses: Record<string, string> = {
    W: "bg-stone-100 text-neutral-950 border-stone-300",
    U: "bg-sky-400 text-sky-950 border-sky-200",
    B: "bg-neutral-800 text-white border-neutral-500",
    R: "bg-red-500 text-white border-red-300",
    G: "bg-emerald-500 text-emerald-950 border-emerald-200",
  };

  const typeRows = Object.entries(typeBreakdown || {}).filter(([, count]) => Number(count) > 0);
  const typeTotal = typeRows.reduce((sum, [, count]) => sum + Number(count || 0), 0) || 1;
  const radarRows = Object.entries(playstyleRadar || {}).filter(([, score]) => Number(score) > 0);
  const curveRows = Object.entries(curveBreakdown || {});
  const curveMax = Math.max(1, ...curveRows.map(([, value]) => Number(value || 0)));

  function ToggleSection({
    title,
    open,
    onToggle,
    children,
  }: {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }) {
    return (
      <div className="flex min-h-[18rem] flex-col rounded-lg border border-neutral-800 bg-neutral-950/35">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold text-cyan-300">{title}</span>
          <span className="rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-200">{open ? "Hide" : "Show"}</span>
        </button>
        {open ? <div className="flex-1 border-t border-neutral-800 p-3">{children}</div> : null}
      </div>
    );
  }

  function ManaPip({ value }: { value: string }) {
    return (
      <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full border text-lg font-black shadow ${manaClasses[value] || "border-neutral-600 bg-neutral-800 text-white"}`}>
        {value}
      </span>
    );
  }

  function toggleColor(value: string) {
    if (isCommander || readOnly) return;
    setColors((current) => current.includes(value) ? current.filter((c) => c !== value) : [...current, value]);
  }

  const heroArt = commanderImage?.art_crop ?? commanderImage?.normal ?? commanderImage?.small ?? null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-neutral-900/50 to-purple-950/20 p-4 shadow-md">
      {heroArt ? (
        <div className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${heroArt})` }} />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/45" />
      <div className="relative flex items-center gap-2 mb-3">
        <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse"></div>
        <h3 className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Deck Overview
        </h3>
      </div>

      <div className="relative grid grid-cols-1 gap-4 text-xs lg:grid-cols-[1.2fr_1fr_0.9fr]">
        {/* Commander */}
        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide flex items-center justify-between">
            <span>{isCommander ? "Commander" : "Deck identity"}</span>
            {!readOnly && !editingCommander && (
              <button
                type="button"
                onClick={() => setEditingCommander(true)}
                className="rounded bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
                title="Edit commander"
              >
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
                      <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
                        <img 
                          src={commanderImage.normal} 
                          alt={commander}
                          className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-2xl font-black text-white">
                  {commander || (isCommander ? "Set commander" : "No feature card set")}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {archetypeLabels.length > 0 ? archetypeLabels.map((label) => (
                    <span key={label} className="rounded-full border border-neutral-500/70 bg-neutral-950/70 px-2 py-1 text-[10px] font-semibold text-neutral-100">
                      {label}
                    </span>
                  )) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide flex items-center gap-1">
            <span>Color Identity</span>
            <span className="text-[8px] opacity-50" title={isCommander ? "Locked from commander" : "Editable for constructed legality"}>
              {isCommander ? "(from Commander)" : "(editable)"}
            </span>
          </div>
          <div className="flex h-[4.75rem] flex-wrap items-center gap-3">
            {colors.length > 0 ? (
              colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleColor(c)}
                  className={isCommander || readOnly ? "cursor-default" : "transition hover:scale-105"}
                >
                  <ManaPip value={c} />
                </button>
              ))
            ) : (
              <span className="text-[10px] text-neutral-400 italic">No colors set</span>
            )}
            {!isCommander && !readOnly ? (["W", "U", "B", "R", "G"].filter((c) => !colors.includes(c)).map((c) => (
              <button key={c} type="button" onClick={() => toggleColor(c)} className="opacity-45 transition hover:scale-105 hover:opacity-100">
                <ManaPip value={c} />
              </button>
            ))) : null}
          </div>
        </div>

        {/* Aim/Goal */}
        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
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
            <div className="min-h-[2.5rem] text-sm leading-relaxed text-neutral-100">
              {aim ? (
                <p className="whitespace-pre-wrap break-words">{aim}</p>
              ) : (
                <p className="text-neutral-500 italic text-[10px]">No aim/goal set. Click Edit to add one.</p>
              )}
            </div>
          )}
        </div>

      </div>

      <div className="relative mt-3 rounded-xl border border-white/10 bg-black/35 p-4">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-400">Deck Value</div>
        <DeckPriceMini deckId={deckId} compact />
      </div>

      <div className="relative mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ToggleSection title="Mana Curve" open={curveOpen} onToggle={() => setCurveOpen((v) => !v)}>
          <div className="grid h-48 grid-cols-7 items-end gap-2">
            {(["1", "2", "3", "4", "5", "6", "7+"] as const).map((key) => {
              const count = Number(curveBreakdown?.[key] || 0);
              const height = Math.round((count / curveMax) * 100);
              return (
                <div key={key} className="flex h-full flex-col items-center justify-end gap-1">
                  <div className="relative w-full max-w-12 rounded-t bg-emerald-500/85 shadow-sm shadow-emerald-500/20" style={{ height: `${Math.max(8, height)}%` }}>
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] tabular-nums">{count}</span>
                  </div>
                  <div className="text-[10px] opacity-70">{key}</div>
                </div>
              );
            })}
          </div>
        </ToggleSection>

        <ToggleSection title="Card Types" open={typesOpen} onToggle={() => setTypesOpen((v) => !v)}>
          <div className="space-y-2">
            {typeRows.length ? typeRows.map(([name, count]) => {
              const pct = Math.round((Number(count || 0) / typeTotal) * 100);
              return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span>{name}</span>
                    <span className="font-mono text-neutral-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-neutral-800">
                    <div className="h-full rounded bg-cyan-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : <div className="text-xs text-neutral-500">No card type data yet.</div>}
          </div>
        </ToggleSection>

        <ToggleSection title="Playstyle Radar" open={radarOpen} onToggle={() => setRadarOpen((v) => !v)}>
          <div className="space-y-2">
            {radarRows.length ? radarRows.map(([name, score]) => {
              const max = Math.max(1, ...radarRows.map(([, value]) => Number(value || 0)));
              const pct = Math.round((Number(score || 0) / max) * 100);
              return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-[11px] capitalize">
                    <span>{name}</span>
                    <span className="font-mono text-neutral-400">{Number(score).toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-neutral-800">
                    <div className="h-full rounded bg-purple-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : <div className="text-xs text-neutral-500">No playstyle data yet.</div>}
          </div>
        </ToggleSection>
      </div>
    </div>
  );
}
