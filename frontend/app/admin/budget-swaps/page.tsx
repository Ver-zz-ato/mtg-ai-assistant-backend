'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ELI5 } from '@/components/AdminHelp';

export default function BudgetSwapsAdminPage() {
  const { user } = useAuth();
  const [swaps, setSwaps] = useState<Record<string, string[]>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [newKey, setNewKey] = useState('');
  const [newValues, setNewValues] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSwaps();
  }, []);

  const loadSwaps = async () => {
    try {
      const response = await fetch('/api/admin/budget-swaps');
      const data = await response.json();
      if (data.ok) {
        setSwaps(data.swaps || {});
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load swaps' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to load swaps' });
    } finally {
      setLoading(false);
    }
  };

  const saveSwaps = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/budget-swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swaps }),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Budget swaps saved successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save swaps' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to save swaps' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (key: string) => {
    setEditingKey(key);
    setEditingValue(swaps[key]?.join(', ') || '');
  };

  const handleSaveEdit = () => {
    if (!editingKey) return;
    const values = editingValue.split(',').map(v => v.trim()).filter(Boolean);
    setSwaps({ ...swaps, [editingKey.toLowerCase()]: values });
    setEditingKey(null);
    setEditingValue('');
  };

  const handleDelete = (key: string) => {
    if (!confirm(`Delete swaps for "${key}"?`)) return;
    const newSwaps = { ...swaps };
    delete newSwaps[key];
    setSwaps(newSwaps);
  };

  const handleAdd = () => {
    if (!newKey.trim()) {
      setMessage({ type: 'error', text: 'Please enter a card name' });
      return;
    }
    const values = newValues.split(',').map(v => v.trim()).filter(Boolean);
    if (values.length === 0) {
      setMessage({ type: 'error', text: 'Please enter at least one swap suggestion' });
      return;
    }
    setSwaps({ ...swaps, [newKey.toLowerCase().trim()]: values });
    setNewKey('');
    setNewValues('');
    setMessage({ type: 'success', text: 'Swap added! Click "Save All Changes" to persist.' });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center">Loading budget swaps...</div>
      </div>
    );
  }

  const sortedKeys = Object.keys(swaps).sort();

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Budget Swaps Management</h1>
        <p className="text-neutral-400 mb-3">
          Manage the budget swap suggestions used in Quick Swaps mode. These are free, fast suggestions for common expensive cards.
        </p>
        <ELI5 heading="Budget Swaps" items={[
          'Quick Swaps mode suggests cheaper alternatives for expensive cards (e.g. Gaea\'s Cradle → Growing Rites).',
          'Add/edit pairs here. Stored in budget-swaps.json. Changes apply after Save.',
          'Use when: adding new popular expensive cards, updating meta-relevant swaps.'
        ]} />
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-red-900/50 border border-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="mb-6 p-4 bg-neutral-900 rounded-lg border border-neutral-700">
        <h2 className="text-xl font-semibold mb-3">Add New Swap</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Expensive Card Name</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g., Gaea's Cradle"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Budget Alternatives (comma-separated)</label>
            <input
              type="text"
              value={newValues}
              onChange={(e) => setNewValues(e.target.value)}
              placeholder="e.g., Growing Rites of Itlimoc, Nykthos"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2"
            />
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded"
        >
          Add Swap
        </button>
      </div>

      <div className="mb-4 flex justify-between items-center">
        <div>
          <span className="text-neutral-400">Total swaps: </span>
          <span className="font-semibold">{sortedKeys.length}</span>
        </div>
        <button
          onClick={saveSwaps}
          disabled={saving}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-800 border-b border-neutral-700">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">Expensive Card</th>
                <th className="text-left p-3 text-sm font-semibold">Budget Alternatives</th>
                <th className="text-right p-3 text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedKeys.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-neutral-400">
                    No swaps configured
                  </td>
                </tr>
              ) : (
                sortedKeys.map((key) => (
                  <tr key={key} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                    <td className="p-3 font-mono text-sm">{key}</td>
                    <td className="p-3">
                      {editingKey === key ? (
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') {
                              setEditingKey(null);
                              setEditingValue('');
                            }
                          }}
                          autoFocus
                          className="w-full bg-neutral-950 border border-neutral-600 rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        <div className="text-sm text-neutral-300">
                          {swaps[key]?.join(', ') || 'No swaps'}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(key)}
                          className="px-3 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 rounded border border-blue-600/30"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(key)}
                          className="px-3 py-1 text-xs bg-red-600/20 hover:bg-red-600/30 rounded border border-red-600/30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
