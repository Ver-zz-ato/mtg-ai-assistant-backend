'use client';

import Link from 'next/link';

export default function CompareDecksWidget() {
  return (
    <div className="bg-gradient-to-br from-purple-900/30 via-blue-900/20 to-purple-900/30 rounded-xl border border-purple-500/30 p-6 hover:border-purple-500/50 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="font-semibold text-lg">Compare Decks</h3>
          </div>
          <p className="text-sm text-gray-300 mb-4">
            Analyze differences between your decks with side-by-side comparison, visual diffs, and detailed stats.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 bg-purple-500/20 rounded-full text-purple-300">Side-by-side</span>
            <span className="px-2 py-1 bg-blue-500/20 rounded-full text-blue-300">Visual Diff</span>
            <span className="px-2 py-1 bg-green-500/20 rounded-full text-green-300">PDF Export</span>
          </div>
        </div>
        <Link 
          href="/compare-decks"
          className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg font-medium transition-all flex items-center gap-2"
        >
          <span>Compare</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

