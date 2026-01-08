"use client";
import React from "react";

export default function FixSingleCardModal({ 
  card, 
  deckId, 
  open, 
  onClose, 
  onSuccess 
}: { 
  card: { id: string; name: string } | null; 
  deckId: string; 
  open: boolean; 
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !card) return;
    
    (async () => {
      try {
        setLoading(true);
        setSuggestions([]);
        setSelected('');
        
        // Try with full name first
        let searchName = card.name;
        let r = await fetch('/api/cards/fuzzy', { 
          method: 'POST', 
          headers: { 'content-type': 'application/json' }, 
          body: JSON.stringify({ names: [searchName] }) 
        });
        let j = await r.json();
        let list: string[] = j?.results?.[searchName]?.all || [];
        
        // If no results and it's a double-faced card, try just the front face
        if (list.length === 0 && searchName.includes('//')) {
          searchName = searchName.split('//')[0].trim();
          r = await fetch('/api/cards/fuzzy', { 
            method: 'POST', 
            headers: { 'content-type': 'application/json' }, 
            body: JSON.stringify({ names: [searchName] }) 
          });
          j = await r.json();
          list = j?.results?.[searchName]?.all || [];
        }
        
        if (list.length === 0) {
          throw new Error(`No suggestions found for "${card.name}". The card might already be correct, or you may need to fix it manually.`);
        }
        
        // Look up each suggestion in cache to get proper capitalization and full DFC names
        const properNames: string[] = [];
        const seen = new Set<string>();
        
        for (const suggestion of list.slice(0, 10)) {
          const cacheRes = await fetch(`/api/cards/cache-lookup?name=${encodeURIComponent(suggestion)}`);
          const cacheJson = await cacheRes.json().catch(() => ({}));
          
          if (cacheJson?.name) {
            // Avoid duplicates
            const normalized = cacheJson.name.toLowerCase();
            if (!seen.has(normalized)) {
              properNames.push(cacheJson.name);
              seen.add(normalized);
            }
          } else if (suggestion && !seen.has(suggestion.toLowerCase())) {
            properNames.push(suggestion);
            seen.add(suggestion.toLowerCase());
          }
        }
        
        // For DFCs, add ALL valid cache variants with the same front face
        if (card.name.includes('//')) {
          const frontFace = card.name.split('//')[0].trim();
          
          try {
            const variantsRes = await fetch(`/api/cards/dfc-variants?frontFace=${encodeURIComponent(frontFace)}`);
            const variantsJson = await variantsRes.json().catch(() => ({}));
            
            if (variantsJson?.variants && Array.isArray(variantsJson.variants)) {
              // Add all valid DFC variants to suggestions
              for (const variant of variantsJson.variants) {
                const normalized = variant.toLowerCase();
                if (!seen.has(normalized)) {
                  properNames.push(variant);
                  seen.add(normalized);
                }
              }
            }
          } catch (e) {
            // Silently fail
          }
        }
        
        if (properNames.length === 0) {
          throw new Error(`No valid suggestions found for "${card.name}". The card might not exist in our database.`);
        }
        
        setSuggestions(properNames);
        setSelected(properNames[0] || '');
      } catch (e: any) {
        alert(e?.message || 'Failed to load suggestions');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [open, card]);

  async function apply() {
    if (!card || !selected.trim()) return;
    
    try {
      setSaving(true);
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: card.id, new_name: selected })
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || 'Rename failed');
      
      window.dispatchEvent(new CustomEvent("toast", { detail: `Fixed: ${card.name} → ${selected}` }));
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Apply failed');
    } finally {
      setSaving(false);
    }
  }

  if (!open || !card) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-md w-full rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🔧</span>
          <h3 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Fix Card Name
          </h3>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400"></div>
            <span className="text-neutral-400">Finding suggestions...</span>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <>
            <div className="mb-4 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50">
              <div className="text-xs text-neutral-400 mb-1">Current name:</div>
              <div className="font-medium text-neutral-200">{card.name}</div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-neutral-400 mb-2 block">
                Select the correct name:
              </label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {suggestions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-neutral-500">
                {suggestions.length > 1 ? `${suggestions.length} suggestions found` : 'Best match found'}
              </div>
            </div>

            {selected && (
              <div className="mb-4 p-3 rounded-lg bg-cyan-950/20 border border-cyan-900/50">
                <div className="text-xs text-cyan-400 mb-1">Will rename to:</div>
                <div className="font-medium text-cyan-300">{selected}</div>
              </div>
            )}
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={saving || loading || !selected}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Applying...' : 'Apply Fix'}
          </button>
        </div>
      </div>
    </div>
  );
}


