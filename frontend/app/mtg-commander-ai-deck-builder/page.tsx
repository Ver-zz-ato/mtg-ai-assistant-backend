import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Commander Deck Builder | MTG Deck Analyzer - ManaTap AI',
  description: 'Build and analyze Magic: The Gathering Commander decks with AI. Get instant deck analysis, budget swaps, curve optimization, and personalized card suggestions. Free MTG deck builder tool.',
  keywords: 'AI commander deck builder, MTG deck analyzer, free EDH deck builder, Magic deck analysis, Commander deck builder AI, MTG deck optimization, budget MTG deck builder',
  alternates: {
    canonical: '/mtg-commander-ai-deck-builder',
  },
  openGraph: {
    title: 'Free AI Commander Deck Builder | ManaTap AI',
    description: 'Build and analyze Magic: The Gathering Commander decks with AI-powered suggestions and optimization.',
    url: 'https://manatap.ai/mtg-commander-ai-deck-builder',
    siteName: 'ManaTap AI',
    images: [
      {
        url: '/manatap-og-image.png',
        width: 1200,
        height: 630,
        alt: 'ManaTap AI - Free MTG Commander Deck Builder',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Commander Deck Builder | ManaTap AI',
    description: 'Build and analyze Magic: The Gathering Commander decks with AI-powered suggestions.',
  },
};

function jsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "ManaTap AI - Free AI Commander Deck Builder",
    "description": "AI-powered Magic: The Gathering Commander deck builder and analyzer. Get instant deck analysis, budget optimization, and personalized card suggestions.",
    "url": "https://manatap.ai/mtg-commander-ai-deck-builder",
    "applicationCategory": "GameApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "AI-powered deck analysis",
      "Budget card swaps",
      "Mana curve optimization",
      "Commander deck suggestions",
      "Free deck builder",
      "MTG deck analyzer"
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "150"
    }
  });
}

export default function HeroLandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptMCAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptLTE4IDBjMy4zMTQgMCA2IDIuNjg2IDYgNnMtMi42ODYgNi02IDYtNi0yLjY4Ni02LTYgMi42ODYtNiA2LTZ6IiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMSIgb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
            <div className="text-center">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 dark:text-white mb-6">
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Free AI Commander Deck Builder
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 mb-4 max-w-3xl mx-auto">
                Build, analyze, and optimize your Magic: The Gathering Commander decks with AI-powered suggestions
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
                Get instant deck analysis, budget swaps, mana curve optimization, and personalized card recommendations. 
                No signup required—start building better decks in seconds.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                <Link
                  href="/my-decks"
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                >
                  Start Analyzing Your Deck →
                </Link>
                <Link
                  href="/blog"
                  className="px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold text-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  Read Deck Building Guides
                </Link>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600 dark:text-gray-400 mb-8">
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>100% Free to Start</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>No Signup Required</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>AI-Powered Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Instant Results</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Why Use an AI Commander Deck Builder?
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                AI-Powered Deck Analysis
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Get instant analysis of your Commander deck's mana curve, card synergy, ramp, draw, and removal. 
                Our AI understands MTG archetypes and suggests improvements tailored to your deck's strategy.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Budget Optimization
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Find cheaper alternatives that maintain your deck's power level. Get budget swaps for expensive 
                cards with AI-powered suggestions that keep your strategy intact.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Mana Curve Optimization
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Visualize your deck's mana curve and get suggestions to smooth it out. Build decks that flow 
                naturally from early game to victory with proper curve distribution.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Personalized Suggestions
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Get card recommendations that match your commander, format, and playstyle. The AI understands 
                tokens, aristocrats, landfall, and other archetypes to suggest synergistic cards.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Instant Results
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Paste your decklist and get analysis in seconds. No waiting, no signup required. 
                Start optimizing your Commander deck immediately.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Format-Aware Analysis
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Built specifically for Commander (EDH) format. Understands singleton rules, color identity, 
                and Commander-specific strategies like go-wide tokens, aristocrats, and combo decks.
              </p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white dark:bg-gray-800 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
              How to Use the Free MTG Deck Analyzer
            </h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  1
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Paste Your Decklist</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Copy your Commander deck from Moxfield, MTGGoldfish, or any deck builder. 
                  Paste it into ManaTap AI—no import needed.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  2
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Get AI Analysis</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Our AI analyzes your deck's curve, synergy, ramp, draw, removal, and win conditions. 
                  Identifies problems and suggests improvements.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  3
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Optimize & Build</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Review AI suggestions, apply budget swaps, and optimize your deck. 
                  Save your improved decklist and share it with friends.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Build Better Commander Decks?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Join thousands of MTG players using AI to optimize their decks. Free to start, no signup required.
            </p>
            <Link
              href="/my-decks"
              className="inline-block px-8 py-4 bg-white text-gray-900 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              Start Analyzing Your Deck Now →
            </Link>
          </div>
        </div>

        {/* FAQ Section for SEO */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                Is the AI Commander deck builder really free?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes! You can analyze unlimited decks for free. No signup required to get started. 
                Pro features like deck version history and advanced analytics are available with a subscription, 
                but core deck analysis is completely free.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                How does the AI deck analyzer work?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Our AI understands MTG archetypes, card synergies, and Commander format rules. It analyzes your 
                deck's mana curve, identifies missing pieces (ramp, draw, removal), and suggests cards that fit 
                your strategy. The AI learns from thousands of successful decks to provide accurate recommendations.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                Can I use this for formats other than Commander?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                While optimized for Commander (EDH), ManaTap AI also supports Modern and Standard formats. 
                The AI adapts its analysis based on format-specific rules, banlists, and deck construction requirements.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                Does the deck builder suggest budget alternatives?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes! Our budget optimization feature finds cheaper alternatives that maintain your deck's power level. 
                Set your budget threshold and get AI-powered suggestions for budget swaps that keep your strategy intact.
              </p>
            </div>
          </div>
        </div>

        {/* Related Resources */}
        <div className="bg-gray-50 dark:bg-gray-900 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
              Learn More About Building Commander Decks
            </h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link
                href="/blog/how-to-build-your-first-commander-deck"
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                  How to Build Your First Commander Deck
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  A beginner-friendly guide to building your first EDH deck from scratch.
                </p>
              </Link>

              <Link
                href="/blog/the-7-most-common-deckbuilding-mistakes"
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                  The 7 Most Common Deckbuilding Mistakes
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Avoid these common pitfalls when building your MTG Commander deck.
                </p>
              </Link>

              <Link
                href="/blog/edh-land-count-what-the-community-actually-runs"
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                  EDH Land Count: What the Community Actually Runs
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Data-driven analysis of optimal land counts in Commander decks.
                </p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

