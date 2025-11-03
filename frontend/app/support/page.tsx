import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Cache for 1 hour (static support content)
export const revalidate = 3600;

// Dynamic import for client component
const SupportFormClient = dynamic(() => import('@/components/SupportForm'), {
  loading: () => (
    <div className="max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-700 rounded w-1/3"></div>
        <div className="h-10 bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-700 rounded"></div>
        <div className="h-32 bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-700 rounded"></div>
      </div>
    </div>
  )
});

export default function SupportPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Support & Information
          </h1>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-6">
            Learn about ManaTap.ai and get help with any questions
          </p>
          <div className="flex flex-wrap gap-4 items-center justify-center">
            <a
              href="mailto:davy@manatap.ai"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold text-base hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              📧 Email Support
            </a>
            <a
              href="https://x.com/ManatapAI"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold text-base hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Follow us on X
            </a>
            <a
              href="https://www.instagram.com/manatap.ai?igsh=Mnl4ZW4xNnJxYnF1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold text-base hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              Follow us on Instagram
            </a>
          </div>
        </div>

        {/* About Section */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-3">
            About ManaTap.ai
          </h2>
          <p className="text-gray-300 mb-4">
            ManaTap.ai is an independent, community-built project created by Davy Seits — a long-time Magic: The Gathering player and tinkerer who wanted smarter, more transparent deck tools.
          </p>
          <p className="text-gray-300">
            The app uses AI to analyse deck costs, simulate draws, and suggest budget swaps — helping players understand and refine their decks rather than replace their creativity. ManaTap is not affiliated with or endorsed by Wizards of the Coast; it's a personal project made for the player community.
          </p>
        </div>

        {/* Core Features Grid */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">
            Core Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">💰</div>
              <h3 className="text-lg font-bold text-white mb-1">
                Cost-to-Finish
              </h3>
              <p className="text-gray-400 text-sm">
                See exactly what your deck still needs and what it costs
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">💡</div>
              <h3 className="text-lg font-bold text-white mb-1">
                Budget Swaps
              </h3>
              <p className="text-gray-400 text-sm">
                Find cheaper equivalents without ruining synergy
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">🎲</div>
              <h3 className="text-lg font-bold text-white mb-1">
                Mulligan & Probability
              </h3>
              <p className="text-gray-400 text-sm">
                Test opening hands and calculate odds
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">📈</div>
              <h3 className="text-lg font-bold text-white mb-1">
                Price Tracker
              </h3>
              <p className="text-gray-400 text-sm">
                Watch for spikes and dips in real time
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">🛠️</div>
              <h3 className="text-lg font-bold text-white mb-1">
                Deck Builder
              </h3>
              <p className="text-gray-400 text-sm">
                Manage and tweak decks with powerful tools
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">🎨</div>
              <h3 className="text-lg font-bold text-white mb-1">
                Custom Cards
              </h3>
              <p className="text-gray-400 text-sm">
                Create your very own MTG custom cards
              </p>
            </div>
          </div>
        </div>

        {/* Technology Section */}
        <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-3">Technology</h2>
          <p className="text-blue-100 mb-4">
            ManaTap runs on a modern stack and is designed to be transparent, privacy-respecting, and fast.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg text-sm font-medium">
              Next.js 15
            </span>
            <span className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg text-sm font-medium">
              Supabase
            </span>
            <span className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg text-sm font-medium">
              OpenAI GPT-5
            </span>
            <span className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg text-sm font-medium">
              Vercel
            </span>
            <span className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg text-sm font-medium">
              Render
            </span>
          </div>
        </div>

        {/* Support Form */}
        <SupportFormClient />

        {/* Links */}
        <div className="mt-8 text-center">
          <div className="inline-flex gap-6 text-sm">
            <Link href="/terms" className="text-gray-400 hover:text-blue-400">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-gray-400 hover:text-blue-400">
              Privacy Policy
            </Link>
            <Link href="/refund" className="text-gray-400 hover:text-blue-400">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
