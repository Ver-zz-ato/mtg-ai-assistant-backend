'use client';

import { useState, useEffect } from 'react';
import { ELI5 } from '@/components/AdminHelp';
import { DEFAULT_BLOG_POSTS } from '@/lib/blog-defaults';

interface BlogEntry {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  gradient: string;
  icon: string;
  imageUrl?: string;
}

const GRADIENT_PRESETS = [
  'from-orange-600 via-red-600 to-pink-600',
  'from-blue-600 via-purple-600 to-pink-600',
  'from-emerald-600 via-green-600 to-teal-600',
  'from-violet-600 via-purple-600 to-indigo-600',
  'from-amber-600 via-orange-600 to-rose-600',
  'from-green-600 via-emerald-600 to-teal-600',
  'from-red-600 via-rose-600 to-pink-600',
  'from-blue-600 via-cyan-600 to-teal-600',
  'from-yellow-600 via-amber-600 to-orange-600',
  'from-indigo-600 via-purple-600 to-pink-600',
];

const ICON_PRESETS = ['🚀', '🎉', '💰', '📊', '💎', '🎯', '⚠️', '🌍', '🔧', '🤖', '🔬'];

export default function AdminBlogPage() {
  const [entries, setEntries] = useState<BlogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadBlog();
  }, []);

  const loadBlog = async () => {
    try {
      const res = await fetch('/api/admin/blog');
      const data = await res.json();

      if (data.ok) {
        setEntries(data.blog?.entries || []);
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

  const saveBlog = async () => {
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      });

      const data = await res.json();

      if (data.ok) {
        await loadBlog();
        alert('Blog saved successfully!');
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
    const newEntry: BlogEntry = {
      slug: 'new-post-slug',
      title: 'New Blog Post',
      excerpt: 'Brief excerpt of the post...',
      date: new Date().toISOString().split('T')[0],
      author: 'ManaTap Team',
      category: 'Announcement',
      readTime: '5 min read',
      gradient: GRADIENT_PRESETS[0],
      icon: '📝',
    };
    setEntries([newEntry, ...entries]);
  };

  const updateEntry = (index: number, field: keyof BlogEntry, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const deleteEntry = (index: number) => {
    if (confirm('Delete this blog entry?')) {
      setEntries(entries.filter((_, i) => i !== index));
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>;
  if (!isAdmin) return <div className="min-h-screen bg-gray-900 text-white p-8"><span className="text-red-400">Admin access required</span></div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Admin • Blog Manager</h1>
        </div>
        <div className="mb-6">
          <ELI5 heading="Public Blog" items={[
            "📝 Blog Listing: Add and edit entries shown on /blog",
            "🖼️ Art & Format: Set gradient, icon, and imageUrl for each post",
            "🔗 Slug: URL path (e.g. my-post → /blog/my-post). Actual page content lives in app/blog/[slug]",
            "✨ Gradient: Use presets like from-blue-600 via-purple-600 to-pink-600",
            "⏱️ When to use: Add new posts, update order, change art or excerpts",
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
              onClick={saveBlog}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => { if (entries.length === 0 || confirm('Replace with defaults? (Current entries will be lost)')) setEntries([...DEFAULT_BLOG_POSTS]); }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              title="Import all blog posts shown on /blog"
            >
              Import Defaults
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
            <div key={`${entry.slug}-${index}`} className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2 items-center">
                  <span className="text-2xl">{entry.icon}</span>
                  <input
                    type="text"
                    value={entry.slug}
                    onChange={(e) => updateEntry(index, 'slug', e.target.value)}
                    className="px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded font-mono text-sm w-48"
                    placeholder="url-slug"
                  />
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => updateEntry(index, 'date', e.target.value)}
                    className="px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm"
                  />
                  <select
                    value={entry.category}
                    onChange={(e) => updateEntry(index, 'category', e.target.value)}
                    className="px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm"
                  >
                    <option value="Announcement">Announcement</option>
                    <option value="Strategy">Strategy</option>
                    <option value="Budget Building">Budget Building</option>
                    <option value="Commander">Commander</option>
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
                    placeholder="Post title..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">Excerpt</label>
                  <textarea
                    value={entry.excerpt}
                    onChange={(e) => updateEntry(index, 'excerpt', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded h-20 resize-y focus:border-blue-500 focus:outline-none"
                    placeholder="Brief excerpt..."
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Author</label>
                    <input
                      type="text"
                      value={entry.author}
                      onChange={(e) => updateEntry(index, 'author', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Read Time</label>
                    <input
                      type="text"
                      value={entry.readTime}
                      onChange={(e) => updateEntry(index, 'readTime', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm"
                      placeholder="5 min read"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Icon</label>
                    <div className="flex gap-1 flex-wrap">
                      {ICON_PRESETS.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => updateEntry(index, 'icon', ic)}
                          className={`px-1.5 py-0.5 rounded text-sm ${entry.icon === ic ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Gradient</label>
                    <select
                      value={entry.gradient}
                      onChange={(e) => updateEntry(index, 'gradient', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-600 bg-gray-700 text-white rounded text-sm"
                    >
                      {GRADIENT_PRESETS.map((g) => (
                        <option key={g} value={g}>{g.replace(/from-|via-|to-/g, '').slice(0, 20)}...</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">Image URL (Scryfall art, etc.)</label>
                  <input
                    type="url"
                    value={entry.imageUrl || ''}
                    onChange={(e) => updateEntry(index, 'imageUrl', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="text-center py-12 text-gray-400 space-y-4">
            <p>The public /blog page shows built-in defaults when the database is empty.</p>
            <p className="text-sm">Click <strong className="text-gray-300">Import Defaults</strong> to load all existing posts here for editing, then <strong className="text-gray-300">Save Changes</strong>.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => setEntries([...DEFAULT_BLOG_POSTS])}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Import Defaults
              </button>
              <button
                onClick={addEntry}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Create First Entry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
