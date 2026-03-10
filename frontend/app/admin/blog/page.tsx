'use client';

import { useState, useEffect } from 'react';
import { ELI5 } from '@/components/AdminHelp';

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

const DEFAULT_ENTRIES: BlogEntry[] = [
  { slug: 'devlog-23-days-soft-launch', title: '🚀 Devlog: 23 Days Into Soft Launch', excerpt: "We're now 23 days into the soft launch of ManaTap.ai...", date: '2025-11-26', author: 'ManaTap Team', category: 'Announcement', readTime: '6 min read', gradient: 'from-orange-600 via-red-600 to-pink-600', icon: '🚀' },
  { slug: 'welcome-to-manatap-ai-soft-launch', title: "🎉 Welcome to ManaTap AI – Your MTG Deck Building Assistant is Here!", excerpt: "We're thrilled to officially launch ManaTap AI!", date: '2025-11-01', author: 'ManaTap Team', category: 'Announcement', readTime: '8 min read', gradient: 'from-blue-600 via-purple-600 to-pink-600', icon: '🎉' },
  { slug: 'budget-commander-100', title: 'Building Competitive EDH on $100: The Complete Guide', excerpt: 'Build powerful Commander decks on a budget...', date: '2025-10-28', author: 'ManaTap Team', category: 'Budget Building', readTime: '5 min read', gradient: 'from-emerald-600 via-green-600 to-teal-600', icon: '💰', imageUrl: 'https://cards.scryfall.io/art_crop/front/e/e/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad.jpg?1764180059' },
  { slug: 'how-to-build-your-first-commander-deck', title: 'How to Build Your First Commander Deck (Beginner Friendly)', excerpt: 'A complete beginner-friendly guide to building your first MTG Commander deck.', date: '2025-01-27', author: 'ManaTap Team', category: 'Commander', readTime: '8 min read', gradient: 'from-green-600 via-emerald-600 to-teal-600', icon: '🎯', imageUrl: 'https://cards.scryfall.io/art_crop/front/8/2/824b2d73-2151-4e5e-9f05-8f63e2bdcaa9.jpg?1730632010' },
  { slug: 'why-ai-can-help-with-mtg-deck-building', title: '🤖 Why AI Can Help With MTG Deck Building (And Where It Needs Work)', excerpt: 'AI is transforming how we build Magic decks, but it\'s not perfect.', date: '2025-01-15', author: 'ManaTap Team', category: 'Strategy', readTime: '8 min read', gradient: 'from-indigo-600 via-purple-600 to-pink-600', icon: '🤖', imageUrl: 'https://cards.scryfall.io/art_crop/front/9/c/9c0c61e3-9f3d-4e7f-9046-0ea336dd8a2d.jpg?1594735806' },
];

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
              onClick={() => { if (entries.length === 0 || confirm('Replace with defaults? (Current entries will be lost)')) setEntries(DEFAULT_ENTRIES); }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              title="Import default blog posts"
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
          <div className="text-center py-12 text-gray-400">
            <p>No blog entries yet.</p>
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
