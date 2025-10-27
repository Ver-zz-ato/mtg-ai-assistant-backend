'use client';

import React, { useState, useEffect } from 'react';
import Modal from './Modal';

interface Version {
  id: string;
  version_number: number;
  deck_text: string;
  changes_summary: string | null;
  changelog_note: string | null;
  card_count: number | null;
  created_at: string;
  created_by: string | null;
}

interface DeckChangelogModalProps {
  deckId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DeckChangelogModal({ deckId, isOpen, onClose }: DeckChangelogModalProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollbackConfirm, setRollbackConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [deckId, isOpen]);

  async function loadVersions() {
    try {
      setLoading(true);
      const response = await fetch(`/api/decks/${deckId}/versions`);
      const data = await response.json();

      if (data.ok) {
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.error('Error loading versions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function rollbackToVersion(versionId: string) {
    const version = versions.find(v => v.id === versionId);
    if (!version) return;

    try {
      const response = await fetch(`/api/decks/${deckId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: versionId }),
      });

      const data = await response.json();

      if (data.ok) {
        window.location.reload(); // Reload to show restored deck
      } else {
        alert(data.error || 'Failed to rollback');
      }
    } catch (err) {
      alert('Network error during rollback');
    } finally {
      setRollbackConfirm(null);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="📝 Deck Changelog">
      {loading ? (
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-4 bg-neutral-800 rounded w-3/4"></div>
          <div className="h-4 bg-neutral-800 rounded w-1/2"></div>
          <div className="h-4 bg-neutral-800 rounded w-2/3"></div>
        </div>
      ) : versions.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <p className="text-sm">No version history yet.</p>
          <p className="text-xs mt-2">Make some changes to see automatic tracking!</p>
        </div>
      ) : (
        <div className="space-y-3 p-4 max-h-[60vh] overflow-y-auto">
          {versions.map((version, index) => (
            <div
              key={version.id}
              className="bg-neutral-800/30 rounded-lg p-3 space-y-2 border border-neutral-700/50"
            >
              {/* Version Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">
                    v{version.version_number}
                  </span>
                  {version.card_count !== null && (
                    <span className="text-xs text-gray-500">
                      {version.card_count} cards
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {formatDate(version.created_at)}
                </span>
              </div>

              {/* Automatic Changes Summary */}
              {version.changes_summary && (
                <p className="text-xs text-gray-300">{version.changes_summary}</p>
              )}

              {/* Manual Changelog Note */}
              {version.changelog_note && (
                <div className="bg-neutral-900/50 rounded p-2 border-l-2 border-blue-500">
                  <p className="text-xs text-white italic">"{version.changelog_note}"</p>
                </div>
              )}

              {/* Rollback Button */}
              {index > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-neutral-700/50">
                  {rollbackConfirm === version.id ? (
                    <>
                      <button
                        onClick={() => rollbackToVersion(version.id)}
                        className="text-xs px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                      >
                        Confirm Rollback
                      </button>
                      <button
                        onClick={() => setRollbackConfirm(null)}
                        className="text-xs px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setRollbackConfirm(version.id)}
                      className="text-xs px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
                    >
                      ↩ Rollback to this version
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}


