"use client";

import { useState } from 'react';

export interface ConfirmDeleteModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  deckName?: string;
}

/**
 * ConfirmDeleteModal - Type "confirm" to delete modal
 * 
 * Requires users to type "confirm" to proceed with deletion.
 * Prevents accidental deletions.
 */
export default function ConfirmDeleteModal({
  open,
  onCancel,
  onConfirm,
  title = "Delete Deck",
  deckName,
}: ConfirmDeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const isValid = confirmText.toLowerCase() === 'confirm';

  if (!open) return null;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm();
      setConfirmText(''); // Reset for next time
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-full max-w-md mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-red-500/30 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>⚠️</span>
                {title}
              </h2>
              <button
                onClick={onCancel}
                className="text-white/80 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-4">
            <div className="text-gray-900 dark:text-white">
              <p className="text-base font-semibold mb-2">
                This action cannot be undone!
              </p>
              {deckName && (
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  You're about to delete: <span className="font-semibold">{deckName}</span>
                </p>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You have 8 seconds to undo after deletion, but to proceed now, type <strong className="text-red-600 dark:text-red-400">confirm</strong> below:
              </p>
            </div>

            {/* Input */}
            <div>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Type "confirm" to delete'
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                autoFocus
              />
              {confirmText && !isValid && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Type exactly: confirm
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                isValid
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
            >
              Delete Deck
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
