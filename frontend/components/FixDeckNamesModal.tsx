"use client";
import React from "react";

type FixItem = {
  originalName: string;
  qty: number;
  suggestions: string[];
  choice?: string;
};

export default function FixDeckNamesModal({ 
  open, 
  onClose,
  items,
  onApply
}: { 
  open: boolean; 
  onClose: () => void;
  items: FixItem[];
  onApply: (choices: Record<string, string>) => void;
}) {
  const [localItems, setLocalItems] = React.useState<FixItem[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // Initialize with first suggestion as default choice
      setLocalItems(items.map(it => ({ 
        ...it, 
        choice: (it.suggestions || [])[0] || it.originalName 
      })));
    }
  }, [open, items]);

  async function apply() {
    try {
      setSaving(true);
      const choices: Record<string, string> = {};
      for (const it of localItems) {
        const c = (it.choice || '').trim();
        if (c) {
          choices[it.originalName] = c;
        }
      }
      onApply(choices);
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Apply failed');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-xl w-full rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">✏️</span>
          <h3 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
            Fix Card Names
          </h3>
        </div>
        
        {localItems.length === 0 && (
          <div className="py-8 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <div className="text-base font-medium text-neutral-200">All card names look good!</div>
            <div className="text-xs text-neutral-400">All cards in your decklist are recognized and match our database.</div>
          </div>
        )}
        
        {localItems.length > 0 && (
          <>
            <div className="mb-3 text-xs text-neutral-400">
              Found <span className="font-semibold text-orange-400">{localItems.length}</span> card{localItems.length !== 1 ? 's' : ''} that need fixing. Select the correct name from the dropdown:
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-auto pr-2 custom-scrollbar">
              {localItems.map((it, idx) => (
                <div key={`${it.originalName}-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-200 truncate">{it.originalName}</div>
                    {it.qty > 1 && (
                      <div className="text-xs text-neutral-400">Qty: {it.qty}</div>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <select 
                    value={it.choice || ''} 
                    onChange={e => {
                      const next = [...localItems];
                      next[idx] = { ...it, choice: e.target.value };
                      setLocalItems(next);
                    }}
                    className="bg-neutral-950 border border-neutral-600 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent min-w-[180px]"
                  >
                    {it.suggestions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
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
            disabled={saving || localItems.length === 0} 
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Applying...' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

