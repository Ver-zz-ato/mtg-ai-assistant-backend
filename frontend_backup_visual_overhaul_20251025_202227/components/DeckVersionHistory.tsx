"use client";

import React, { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface Version {
  id: string;
  version_number: number;
  deck_text: string;
  changes_summary: string;
  card_count: number;
  created_at: string;
}

interface DeckVersionHistoryProps {
  deckId: string;
  isPro: boolean;
}

export default function DeckVersionHistory({ deckId, isPro }: DeckVersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);

  useEffect(() => {
    if (open && isPro) {
      fetchVersions();
    }
  }, [deckId, open, isPro]);

  async function fetchVersions() {
    try {
      setLoading(true);
      const res = await fetch(`/api/decks/${deckId}/versions`, { cache: 'no-store' });
      const data = await res.json();
      
      if (data.ok) {
        setVersions(data.versions || []);
      } else {
        setError(data.error || 'Failed to load versions');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }

  async function saveVersion(summary?: string) {
    try {
      setSaving(true);
      setError(null);
      
      const res = await fetch(`/api/decks/${deckId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          changes_summary: summary || `Version ${versions.length + 1}` 
        }),
      });

      const data = await res.json();

      if (data.ok) {
        await fetchVersions();
        capture('deck_version_saved', { deck_id: deckId });
        const { toast } = await import('@/lib/toast-client');
        toast(`✅ Version ${data.version.version_number} saved (${data.version.card_count} cards)`, 'success');
      } else {
        setError(data.error || 'Failed to save version');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save version');
    } finally {
      setSaving(false);
    }
  }

  async function restoreVersion(versionId: string, versionNumber: number) {
    // Use undo toast for confirmation
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `restore-version-${versionId}`,
      message: `Restoring to version ${versionNumber}...`,
      duration: 5000,
      onUndo: () => {
        // Cancel the restore
        console.log('Version restore cancelled');
      },
      onExecute: async () => {
        try {
          setRestoring(true);
          setError(null);
          
          const res = await fetch(`/api/decks/${deckId}/versions?versionId=${versionId}`, {
            method: 'PUT',
          });

          const data = await res.json();

          if (data.ok) {
            capture('deck_version_restored', { deck_id: deckId, version: versionNumber });
            // Force full page reload to ensure cards table is refreshed
            window.location.reload();
          } else {
            setError(data.error || 'Failed to restore version');
          }
        } catch (e: any) {
          setError(e.message || 'Failed to restore version');
        } finally {
          setRestoring(false);
        }
      },
    });
  }

  if (!isPro) {
    return (
      <div className="bg-gradient-to-r from-amber-900/20 to-yellow-900/20 border border-amber-800/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">⏱️</span>
          <h3 className="font-semibold text-amber-400">Deck Versioning</h3>
          <span className="ml-auto text-xs bg-amber-600/30 text-amber-300 px-2 py-0.5 rounded-full">PRO</span>
        </div>
        <p className="text-sm text-gray-300 mb-3">
          Save snapshots of your deck at any point. View change history and restore previous versions.
        </p>
        <a 
          href="/pricing" 
          className="inline-block px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 text-white rounded-lg text-sm font-semibold hover:from-amber-700 hover:to-yellow-700 transition-colors"
        >
          Upgrade to Pro
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm font-semibold transition-colors"
        >
          <span>⏱️</span>
          <span>Version History</span>
          <span className="text-xs bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded-full">PRO</span>
          <span className="ml-2">{open ? '▼' : '▶'}</span>
        </button>
        
        <button
          onClick={() => saveVersion()}
          disabled={saving}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed border border-blue-500 rounded-lg text-sm font-semibold transition-colors"
        >
          {saving ? 'Saving...' : 'Save Version'}
        </button>
        
        <button
          onClick={() => setChangelogOpen(true)}
          className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm font-semibold transition-colors"
        >
          📝 View Changelog
        </button>
      </div>
      
      {/* Changelog Modal */}
      {changelogOpen && (() => {
        try {
          const DeckChangelogModal = require('./DeckChangelogModal').default;
          return <DeckChangelogModal deckId={deckId} isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />;
        } catch {
          return null;
        }
      })()}

      {open && (
        <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 p-4 space-y-4">
          {error && (
            <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-neutral-800 rounded"></div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No versions saved yet. Click "Save Version" to create your first snapshot!
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {versions.map((version) => (
                <div 
                  key={version.id} 
                  className={`bg-neutral-800/50 rounded-lg p-3 border transition-colors ${
                    selectedVersion?.id === version.id 
                      ? 'border-blue-500' 
                      : 'border-neutral-700/50 hover:border-neutral-600'
                  }`}
                  onClick={() => setSelectedVersion(version)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-blue-400">
                          Version {version.version_number}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(version.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-300">
                        {version.changes_summary}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {version.card_count} cards
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreVersion(version.id, version.version_number);
                      }}
                      disabled={restoring}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                    >
                      {restoring ? 'Restoring...' : 'Restore'}
                    </button>
                  </div>
                  
                  {selectedVersion?.id === version.id && (
                    <details className="mt-2 pt-2 border-t border-neutral-700">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                        View deck snapshot
                      </summary>
                      <pre className="mt-2 text-xs bg-black/30 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-gray-300">
                        {version.deck_text}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-neutral-700">
            <p className="text-xs text-gray-500">
              💡 Tip: Versions are automatically saved when you make major edits. You can also manually save anytime.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Keeping last 10 versions per deck.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

