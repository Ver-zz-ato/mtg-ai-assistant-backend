'use client';

import { useState, useEffect } from 'react';
import { ELI5 } from '@/components/AdminHelp';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  features?: string[];
  fixes?: string[];
  type: 'feature' | 'fix' | 'improvement' | 'breaking';
}

export default function AdminChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadChangelog();
  }, []);

  const loadChangelog = async () => {
    try {
      const res = await fetch('/api/admin/changelog');
      const data = await res.json();
      
      if (data.ok) {
        setEntries(data.changelog?.entries || []);
        setIsAdmin(data.is_admin);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveChangelog = async () => {
    setSaving(true);
    setError('');
    
    try {
      const res = await fetch('/api/admin/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      });
      
      const data = await res.json();
      
      if (data.ok) {
        alert('Changelog saved successfully!');
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addEntry = () => {
    const newEntry: ChangelogEntry = {
      version: 'v1.0.0',
      date: new Date().toISOString().split('T')[0],
      title: 'New Update',
      description: 'Description of changes in this update...',
      features: [],
      fixes: [],
      type: 'feature'
    };
    setEntries([newEntry, ...entries]);
  };

  const updateEntry = (index: number, field: keyof ChangelogEntry, value: any) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const deleteEntry = (index: number) => {
    if (confirm('Delete this changelog entry?')) {
      setEntries(entries.filter((_, i) => i !== index));
    }
  };

  const addListItem = (entryIndex: number, listType: 'features' | 'fixes') => {
    const updated = [...entries];
    if (!updated[entryIndex][listType]) {
      updated[entryIndex][listType] = [];
    }
    updated[entryIndex][listType]!.push('New item...');
    setEntries(updated);
  };

  const updateListItem = (entryIndex: number, listType: 'features' | 'fixes', itemIndex: number, value: string) => {
    const updated = [...entries];
    if (updated[entryIndex][listType]) {
      updated[entryIndex][listType]![itemIndex] = value;
      setEntries(updated);
    }
  };

  const deleteListItem = (entryIndex: number, listType: 'features' | 'fixes', itemIndex: number) => {
    const updated = [...entries];
    if (updated[entryIndex][listType]) {
      updated[entryIndex][listType] = updated[entryIndex][listType]!.filter((_, i) => i !== itemIndex);
      setEntries(updated);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>;
  if (!isAdmin) return <div className="min-h-screen bg-gray-900 text-white p-8"><span className="text-red-400">Admin access required</span></div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Admin • Changelog Manager</h1>
        </div>
        <div className="mb-6">
          <ELI5 heading="Public Changelog" items={[
            "📝 User-Facing Updates: Add changelog entries users see on the /changelog page",
            "🎯 Announce Features: Document new features, bug fixes, improvements",
            "🏷️ Version Tracking: Tag releases with version numbers and dates",
            "✨ Engagement: Keep users informed about what's new and improved",
            "⏱️ When to use: After every deploy with user-visible changes",
            "🔄 How often: Every major feature release or bug fix users will notice",
            "💡 Good practice: Write clear, user-friendly descriptions - avoid technical jargon",
            "🚀 Types: Features (new stuff), Fixes (bugs squashed), Improvements (better UX), Breaking (major changes)"
          ]} />
        </div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button 
              onClick={addEntry}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Entry
            </button>
            <button 
              onClick={saveChangelog}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900 border border-red-600 text-red-200 rounded">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {entries.map((entry, index) => (
            <div key={index} className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-4 items-center">
                  <input
                    type="text"
                    value={entry.version}
                    onChange={(e) => updateEntry(index, 'version', e.target.value)}
                    className="px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded font-mono text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="v1.0.0"
                  />
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => updateEntry(index, 'date', e.target.value)}
                    className="px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <select
                    value={entry.type}
                    onChange={(e) => updateEntry(index, 'type', e.target.value)}
                    className="px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="feature">Feature</option>
                    <option value="fix">Fix</option>
                    <option value="improvement">Improvement</option>
                    <option value="breaking">Breaking</option>
                  </select>
                </div>
                <button 
                  onClick={() => deleteEntry(index)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">Title</label>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(e) => updateEntry(index, 'title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:border-blue-500 focus:outline-none"
                    placeholder="Update title..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">Description</label>
                  <textarea
                    value={entry.description}
                    onChange={(e) => updateEntry(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded h-20 resize-y focus:border-blue-500 focus:outline-none"
                    placeholder="Describe the changes..."
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Features */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">Features</label>
                      <button 
                        onClick={() => addListItem(index, 'features')}
                        className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(entry.features || []).map((feature, fIndex) => (
                        <div key={fIndex} className="flex gap-2">
                          <input
                            type="text"
                            value={feature}
                            onChange={(e) => updateListItem(index, 'features', fIndex, e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Feature description..."
                          />
                          <button 
                            onClick={() => deleteListItem(index, 'features', fIndex)}
                            className="px-2 py-1 bg-red-400 text-white rounded text-xs hover:bg-red-500"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fixes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">Fixes</label>
                      <button 
                        onClick={() => addListItem(index, 'fixes')}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(entry.fixes || []).map((fix, fIndex) => (
                        <div key={fIndex} className="flex gap-2">
                          <input
                            type="text"
                            value={fix}
                            onChange={(e) => updateListItem(index, 'fixes', fIndex, e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Bug fix description..."
                          />
                          <button 
                            onClick={() => deleteListItem(index, 'fixes', fIndex)}
                            className="px-2 py-1 bg-red-400 text-white rounded text-xs hover:bg-red-500"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>No changelog entries yet.</p>
            <button 
              onClick={addEntry}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create First Entry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}