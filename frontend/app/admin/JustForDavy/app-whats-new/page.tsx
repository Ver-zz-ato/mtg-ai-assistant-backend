'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ELI5 } from '@/components/AdminHelp';

interface AppChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  features?: string[];
  fixes?: string[];
  type: 'feature' | 'fix' | 'improvement' | 'breaking';
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

function entryToJsonbObject(entry: AppChangelogEntry): string {
  const version = `'${escapeSql(entry.version)}'`;
  const date = `'${escapeSql(entry.date)}'`;
  const type = `'${escapeSql(entry.type)}'`;
  const title = `'${escapeSql(entry.title)}'`;
  const description = `'${escapeSql(entry.description)}'`;
  const features =
    entry.features && entry.features.length > 0
      ? `jsonb_build_array(${entry.features.map((f) => `'${escapeSql(f)}'`).join(', ')})`
      : `'[]'::jsonb`;
  const fixes =
    entry.fixes && entry.fixes.length > 0
      ? `jsonb_build_array(${entry.fixes.map((f) => `'${escapeSql(f)}'`).join(', ')})`
      : `'[]'::jsonb`;

  return `jsonb_build_object(
    'version', ${version},
    'date', ${date},
    'type', ${type},
    'title', ${title},
    'description', ${description},
    'features', ${features},
    'fixes', ${fixes}
  )`;
}

function generateSql(entries: AppChangelogEntry[]): string {
  if (entries.length === 0) {
    return `-- Add at least one entry first, then click Generate SQL.`;
  }

  const entriesJsonb = entries.map(entryToJsonbObject).join(', ');
  const combinedArray = `jsonb_build_array(${entriesJsonb})`;

  return `-- APP ONLY What's New: Run this in Supabase SQL Editor
-- Inserts into app_config key 'app_changelog' (mobile app reads this)

-- 1. Ensure row exists
INSERT INTO app_config (key, value, updated_at)
VALUES ('app_changelog', '{"entries":[]}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- 2. Prepend new entries (newest first from your list)
UPDATE app_config
SET value = jsonb_set(
  value,
  '{entries}',
  ${combinedArray} || COALESCE(value->'entries', '[]'::jsonb)
)
WHERE key = 'app_changelog';`;
}

export default function AppWhatsNewPage() {
  const [entries, setEntries] = useState<AppChangelogEntry[]>([]);
  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const addEntry = () => {
    const newEntry: AppChangelogEntry = {
      version: 'v1.0.0',
      date: new Date().toISOString().split('T')[0],
      title: 'New Update',
      description: 'Description of changes in this update...',
      features: [],
      fixes: [],
      type: 'feature',
    };
    setEntries([newEntry, ...entries]);
  };

  const updateEntry = (index: number, field: keyof AppChangelogEntry, value: unknown) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const deleteEntry = (index: number) => {
    if (confirm('Delete this entry?')) {
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

  const updateListItem = (
    entryIndex: number,
    listType: 'features' | 'fixes',
    itemIndex: number,
    value: string
  ) => {
    const updated = [...entries];
    if (updated[entryIndex][listType]) {
      updated[entryIndex][listType]![itemIndex] = value;
      setEntries(updated);
    }
  };

  const deleteListItem = (
    entryIndex: number,
    listType: 'features' | 'fixes',
    itemIndex: number
  ) => {
    const updated = [...entries];
    if (updated[entryIndex][listType]) {
      updated[entryIndex][listType] = updated[entryIndex][listType]!.filter(
        (_, i) => i !== itemIndex
      );
      setEntries(updated);
    }
  };

  const handleGenerateSql = () => {
    setGeneratedSql(generateSql(entries));
  };

  const handleCopy = async () => {
    if (!generatedSql) return;
    await navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/admin/JustForDavy"
              className="text-sm text-gray-400 hover:text-white mb-2 inline-block"
            >
              ← Back to JustForDavy
            </Link>
            <h1 className="text-2xl font-bold text-white">APP ONLY What&apos;s New</h1>
          </div>
        </div>

        <div className="mb-6">
          <ELI5
            heading="App Changelog (Mobile Only)"
            items={[
              "📱 Mobile App: Entries appear in the app's What's New (hamburger menu → What's New)",
              "🔧 Generate SQL: Build entries below, click Generate SQL, then copy & paste into Supabase SQL Editor",
              "📋 No direct save: This page does NOT write to the database — you run the SQL yourself",
              "✨ Format: Version, date, type, title, description, features[], fixes[] — same as website changelog",
              "🆕 Prepend: Generated SQL prepends your entries to existing app_changelog (newest first)",
            ]}
          />
        </div>

        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={addEntry}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Add Entry
          </button>
          <button
            onClick={handleGenerateSql}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Generate SQL
          </button>
        </div>

        <div className="space-y-6">
          {entries.map((entry, index) => (
            <div
              key={`${entry.version}-${entry.date}-${index}`}
              className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-sm"
            >
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
                    onChange={(e) =>
                      updateEntry(index, 'type', e.target.value as AppChangelogEntry['type'])
                    }
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
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Description
                  </label>
                  <textarea
                    value={entry.description}
                    onChange={(e) => updateEntry(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded h-20 resize-y focus:border-blue-500 focus:outline-none"
                    placeholder="Describe the changes..."
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
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
                            onChange={(e) =>
                              updateListItem(index, 'features', fIndex, e.target.value)
                            }
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
                            onChange={(e) =>
                              updateListItem(index, 'fixes', fIndex, e.target.value)
                            }
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
            <p>No entries yet.</p>
            <button
              onClick={addEntry}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add First Entry
            </button>
          </div>
        )}

        {generatedSql && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Generated SQL — copy and run in Supabase SQL Editor
              </label>
              <button
                onClick={handleCopy}
                className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="p-4 bg-gray-950 border border-gray-700 rounded-lg text-sm text-gray-200 overflow-x-auto whitespace-pre-wrap font-mono">
              {generatedSql}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
