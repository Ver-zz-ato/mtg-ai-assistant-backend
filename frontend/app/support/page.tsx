import React from 'react';
import Link from 'next/link';

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Support & Information
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-6">
            Learn about ManaTap.ai and get help with any questions
          </p>
          <a
            href="mailto:davy@manatap.ai"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold text-base hover:from-blue-700 hover:to-purple-700 transition-all"
          >
            📧 Email Support
          </a>
        </div>

        {/* About Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            About ManaTap.ai
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            ManaTap.ai is an independent, community-built project created by Davy Seits — a long-time Magic: The Gathering player and tinkerer who wanted smarter, more transparent deck tools.
          </p>
          <p className="text-gray-600 dark:text-gray-300">
            The app uses AI to analyse deck costs, simulate draws, and suggest budget swaps — helping players understand and refine their decks rather than replace their creativity. ManaTap is not affiliated with or endorsed by Wizards of the Coast; it's a personal project made for the player community.
          </p>
        </div>

        {/* Core Features Grid */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
            Core Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">💰</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Cost-to-Finish
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                See exactly what your deck still needs and what it costs
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">💡</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Budget Swaps
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Find cheaper equivalents without ruining synergy
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">🎲</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Mulligan & Probability
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Test opening hands and calculate odds
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">📈</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Price Tracker
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Watch for spikes and dips in real time
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">🛠️</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Deck Builder
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Manage and tweak decks with powerful tools
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="text-3xl mb-2">🎨</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Custom Cards
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
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

        {/* Support Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
            Get Help
          </h2>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Questions, bug reports, or ideas?
            </p>
            <a
              href="mailto:davy@manatap.ai"
              className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-base font-medium"
            >
              📧 davy@manatap.ai
            </a>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              We usually reply within two business days
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="mt-8 text-center">
          <div className="inline-flex gap-6 text-sm">
            <Link href="/terms" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
              Privacy Policy
            </Link>
            <Link href="/refund" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
