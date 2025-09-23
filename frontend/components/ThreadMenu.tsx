'use client';
import React, { useState } from 'react';
import { renameThread, deleteThread, exportThread, importThread, linkThread } from '@/lib/threads';

export default function ThreadMenu({
  threadId,
  onChanged,
  onDeleted,
  deckId,
}: {
  threadId: string | null;
  onChanged?: () => void;
  onDeleted?: () => void;
  deckId?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  async function doRename() {
    const t = prompt('Rename thread to:');
    if (!t || !threadId) return;
    setBusy(true);
    try {
      await renameThread(threadId, t);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!threadId) return;
    if (!confirm('Delete this thread?')) return;
    setBusy(true);
    try {
      await deleteThread(threadId);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    if (!threadId) return;
    setBusy(true);
    try {
      await exportThread(threadId);
    } finally {
      setBusy(false);
    }
  }

  // Import expects a payload object with { title, messages, deckId? }.
  // We open a file picker, parse JSON, and pass it through.
  async function doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    return new Promise<void>((resolve) => {
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve();
        setBusy(true);
        try {
          const text = await file.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            alert('Invalid JSON file.');
            return resolve();
          }
          // Normalize a few common shapes
          // If the JSON was an export envelope { title, messages, deckId }
          // or a raw array of messages, massage into the expected shape.
          let payload: any = data;
          if (Array.isArray(data)) {
            payload = { title: 'Imported Thread', messages: data };
          } else if (data && data.thread) {
            payload = data.thread;
          }
          if (!payload?.title || !payload?.messages) {
            alert('File missing required fields (title, messages).');
            return resolve();
          }
          await importThread(payload);
          onChanged?.();
        } catch (e: any) {
          alert(e?.message ?? 'Import failed');
        } finally {
          setBusy(false);
          resolve();
        }
      };
      input.click();
    });
  }

  async function doLink() {
    if (!threadId) return;
    const deck = prompt('Enter deck ID to link (UUID):', deckId || '');
    if (!deck) return;
    setBusy(true);
    try {
      await linkThread(threadId, deck);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const disabled = !threadId || busy;

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doRename} disabled={disabled} data-testid="thread-action">
        Rename
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doDelete} disabled={disabled} data-testid="thread-action">
        Delete
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doExport} disabled={disabled} data-testid="thread-action">
        Export
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doImport} disabled={busy} data-testid="thread-action">
        Import
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doLink} disabled={disabled} data-testid="thread-action">
        {deckId ? 'Link (change)' : 'Link to deck'}
      </button>
    </div>
  );
}
