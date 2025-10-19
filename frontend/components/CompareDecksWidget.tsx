'use client';

import Link from 'next/link';

export default function CompareDecksWidget() {
  return (
    <div className="bg-gradient-to-br from-purple-900/30 via-blue-900/20 to-purple-900/30 rounded-xl border border-purple-500/30 p-4 hover:border-purple-500/50 transition-all">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <svg className="w-5 h-5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base mb-1">Compare Decks</h3>
            <p className="text-xs text-gray-400">
              Analyze side-by-side with visual diffs and export to PDF
            </p>
          </div>
        </div>
        <Link 
          href="/compare-decks"
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0"
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
