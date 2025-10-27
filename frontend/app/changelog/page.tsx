'use client';

import { useState, useEffect } from 'react';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  features?: string[];
  fixes?: string[];
  type?: 'feature' | 'fix' | 'improvement' | 'breaking';
}

const typeColors = {
  feature: 'bg-green-900/20 text-green-400 border-green-800',
  fix: 'bg-blue-900/20 text-blue-400 border-blue-800',
  improvement: 'bg-purple-900/20 text-purple-400 border-purple-800',
  breaking: 'bg-red-900/20 text-red-400 border-red-800'
};

const typeEmojis = {
  feature: '✨',
  fix: '🐛',
  improvement: '⚡',
  breaking: '💥'
};

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadChangelog();
  }, []);

  const loadChangelog = async () => {
    try {
      const res = await fetch('/api/changelog');
      const data = await res.json();
      
      if (data.ok) {
        setEntries(data.changelog?.entries || []);
      } else {
        setError(data.error || 'Failed to load changelog');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-black text-white min-h-screen">
        <div className="animate-pulse">
          <div className="h-8 bg-neutral-800 rounded w-1/3 mb-4"></div>
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                <div className="h-6 bg-neutral-800 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-neutral-800 rounded w-full mb-4"></div>
                <div className="h-4 bg-neutral-800 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-black text-white min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">What's New</h1>
        <p className="text-neutral-400">Stay up to date with the latest features, improvements, and fixes.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {entries.length === 0 && !error && (
        <div className="text-center py-12 text-neutral-500">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-lg mb-2">No updates yet</p>
          <p>Check back later for the latest features and improvements!</p>
        </div>
      )}

      <div className="space-y-8">
        {entries.map((entry, index) => (
          <article key={index} className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <header className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-lg font-semibold text-white">
                  {entry.version}
                </span>
                {entry.type && (
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${typeColors[entry.type]}`}>
                    <span>{typeEmojis[entry.type]}</span>
                    {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">
                {entry.title}
              </h2>
              <time className="text-sm text-neutral-400">
                {formatDate(entry.date)}
              </time>
            </header>

            <div className="prose prose-neutral max-w-none">
              <p className="text-neutral-300 leading-relaxed mb-4">
                {entry.description}
              </p>

              {(entry.features && entry.features.length > 0) && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                    ✨ New Features
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-neutral-400 ml-4">
                    {entry.features.map((feature, fIndex) => (
                      <li key={fIndex}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(entry.fixes && entry.fixes.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-1">
                    🐛 Bug Fixes
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-neutral-400 ml-4">
                    {entry.fixes.map((fix, fIndex) => (
                      <li key={fIndex}>{fix}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-12 text-center text-neutral-500 text-sm">
        <p>Want to suggest a feature or report a bug?</p>
        <p>Reach out to us through the feedback form or chat!</p>
      </div>
    </div>
  );
}