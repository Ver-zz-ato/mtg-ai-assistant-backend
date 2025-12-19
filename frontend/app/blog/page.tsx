import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MTG Deck Building Blog | ManaTap AI',
  description: 'Tips, strategies, and insights for building better Magic: The Gathering decks',
};

// Blog posts data - will move to MDX files later
const blogPosts = [
  {
    slug: 'devlog-23-days-soft-launch',
    title: '🚀 Devlog: 23 Days Into Soft Launch',
    excerpt: 'We\'re now 23 days into the soft launch of ManaTap.ai, and the project has already grown faster than we expected. What began as an early-access experiment is turning into a genuinely smarter, sharper deck-building assistant.',
    date: '2025-11-26',
    author: 'ManaTap Team',
    category: 'Announcement',
    readTime: '6 min read',
    gradient: 'from-orange-600 via-red-600 to-pink-600',
    icon: '🚀',
  },
  {
    slug: 'welcome-to-manatap-ai-soft-launch',
    title: '🎉 Welcome to ManaTap AI – Your MTG Deck Building Assistant is Here!',
    excerpt: 'We\'re thrilled to officially launch ManaTap AI! After months of development and testing, we\'re opening the gates to help you build better Magic: The Gathering decks with the power of AI.',
    date: '2025-11-01',
    author: 'ManaTap Team',
    category: 'Announcement',
    readTime: '8 min read',
    gradient: 'from-blue-600 via-purple-600 to-pink-600',
    icon: '🎉',
  },
  {
    slug: 'budget-commander-100',
    title: 'Building Competitive EDH on $100: The Complete Guide',
    excerpt: 'Build powerful Commander decks on a budget with smart card choices. Learn where to save, where to splurge, and which commanders offer the best value.',
    date: '2025-10-28',
    author: 'ManaTap Team',
    category: 'Budget Building',
    readTime: '5 min read',
    gradient: 'from-emerald-600 via-green-600 to-teal-600',
    icon: '💰',
  },
  {
    slug: 'mana-curve-mastery',
    title: 'Mastering the Mana Curve: The Foundation of Winning Deck Construction',
    excerpt: 'Learn the 2-3-4 rule for Commander and avoid common curve mistakes. Build decks that flow smoothly from early game to victory.',
    date: '2025-10-28',
    author: 'ManaTap Team',
    category: 'Strategy',
    readTime: '4 min read',
    gradient: 'from-violet-600 via-purple-600 to-indigo-600',
    icon: '📊',
  },
  {
    slug: 'budget-edh-hidden-gems',
    title: 'Building Budget EDH: 5 Hidden Gems Under $1',
    excerpt: 'Discover powerful budget cards that punch above their weight class in Commander. Build competitive decks without breaking the bank.',
    date: '2025-10-18',
    author: 'ManaTap Team',
    category: 'Budget Building',
    readTime: '5 min read',
    gradient: 'from-amber-600 via-orange-600 to-rose-600',
    icon: '💎',
  },
  {
    slug: 'how-to-build-your-first-commander-deck',
    title: 'How to Build Your First Commander Deck (Beginner Friendly)',
    excerpt: 'A complete beginner-friendly guide to building your first Magic: The Gathering Commander deck. Learn deck structure, card selection, and essential strategies.',
    date: '2025-01-27',
    author: 'ManaTap Team',
    category: 'Commander',
    readTime: '8 min read',
    gradient: 'from-green-600 via-emerald-600 to-teal-600',
    icon: '🎯',
  },
  {
    slug: 'the-7-most-common-deckbuilding-mistakes',
    title: 'The 7 Most Common Deckbuilding Mistakes in MTG',
    excerpt: 'Avoid these 7 common mistakes when building Magic: The Gathering decks. Learn how to fix mana curves, ramp issues, and card selection problems.',
    date: '2025-01-27',
    author: 'ManaTap Team',
    category: 'Strategy',
    readTime: '6 min read',
    gradient: 'from-red-600 via-rose-600 to-pink-600',
    icon: '⚠️',
  },
  {
    slug: 'edh-land-count-what-the-community-actually-runs',
    title: 'EDH Land Count: What the Community Actually Runs',
    excerpt: 'Data-driven analysis of optimal land counts in Commander decks. Learn how many lands to run based on your deck\'s strategy, ramp, and curve.',
    date: '2025-01-27',
    author: 'ManaTap Team',
    category: 'Strategy',
    readTime: '7 min read',
    gradient: 'from-blue-600 via-cyan-600 to-teal-600',
    icon: '🌍',
  },
  {
    slug: 'top-budget-staples-every-mtg-player-should-know-2025',
    title: 'Top Budget Staples Every MTG Player Should Know in 2025',
    excerpt: 'Discover the best budget Magic: The Gathering staples under $5 that every Commander player should own. Build competitive decks without breaking the bank.',
    date: '2025-01-27',
    author: 'ManaTap Team',
    category: 'Budget Building',
    readTime: '9 min read',
    gradient: 'from-yellow-600 via-amber-600 to-orange-600',
    icon: '💎',
  },
  {
    slug: 'bug-fixes-and-improvements-january-2025',
    title: '🔧 Bug Fixes & Improvements: Making ManaTap More Reliable',
    excerpt: 'We\'ve been hard at work fixing bugs, improving the user experience, and making ManaTap AI more reliable. Here\'s what\'s new in our latest update.',
    date: '2025-01-27',
    author: 'ManaTap Team',
    category: 'Announcement',
    readTime: '5 min read',
    gradient: 'from-blue-600 via-cyan-600 to-teal-600',
    icon: '🔧',
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            MTG Deck Building Blog
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Tips, strategies, and insights to help you build better Magic: The Gathering decks
          </p>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 justify-center mb-12">
          <span className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium">
            All Posts
          </span>
          <span className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
            Budget Building
          </span>
          <span className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
            Strategy
          </span>
          <span className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
            Commander
          </span>
          <span className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
            Announcement
          </span>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
            >
              {/* Hero Image */}
              <div className={`h-48 bg-gradient-to-br ${post.gradient} flex items-center justify-center relative overflow-hidden`}>
                <div className="absolute inset-0 bg-black/10"></div>
                <div className="relative z-10 text-8xl drop-shadow-2xl animate-pulse">{post.icon}</div>
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent"></div>
              </div>

              <div className="p-6">
                {/* Category & Read Time */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    post.category === 'Strategy' 
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : post.category === 'Announcement'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  }`}>
                    {post.category}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    • {post.readTime}
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-500 group-hover:to-purple-500 transition-all line-clamp-2">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-medium">{post.author}</span>
                  <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </Link>
          ))}

          {/* Coming Soon Cards */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 opacity-60">
            <div className="h-48 bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center">
              <div className="text-6xl">📝</div>
            </div>
            <div className="p-6">
              <span className="text-xs font-semibold text-gray-500">Coming Soon</span>
              <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mt-2 mb-3">
                More articles on the way!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                We're working on more great content about deck building, card analysis, and MTG strategy.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Build Better Decks?
          </h2>
          <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
            Use ManaTap AI's powerful tools to analyze your decks, find budget alternatives, and optimize your card choices.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/mtg-commander-ai-deck-builder"
              className="px-6 py-3 bg-white text-blue-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
            >
              Free Deck Builder →
            </Link>
            <Link
              href="/my-decks"
              className="px-6 py-3 bg-white/20 backdrop-blur text-white rounded-lg font-bold hover:bg-white/30 transition-colors"
            >
              Start Building
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 bg-white/20 backdrop-blur text-white rounded-lg font-bold hover:bg-white/30 transition-colors"
            >
              View Pro Features
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

