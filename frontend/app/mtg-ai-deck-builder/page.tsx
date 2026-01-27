import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MTG AI Deck Builder | Free Magic: The Gathering AI Deck Analyzer - ManaTap AI',
  description: 'Build and analyze Magic: The Gathering decks with AI. Free MTG AI deck builder for Commander, Modern, and Standard. Get instant deck analysis, budget swaps, and personalized card suggestions.',
  keywords: 'mtg ai deck builder, mtg ai, magic the gathering ai, ai deck builder mtg, commander ai deck builder, modern ai deck builder, standard ai deck builder, mtg deck analyzer ai',
  alternates: {
    canonical: '/mtg-ai-deck-builder',
  },
  openGraph: {
    title: 'MTG AI Deck Builder | Free Magic: The Gathering AI - ManaTap AI',
    description: 'Build and analyze Magic: The Gathering decks with AI-powered suggestions for Commander, Modern, and Standard formats.',
    url: 'https://www.manatap.ai/mtg-ai-deck-builder',
    siteName: 'ManaTap AI',
    images: [
      {
        url: '/manatap-og-image.png',
        width: 1200,
        height: 630,
        alt: 'ManaTap AI - MTG AI Deck Builder',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MTG AI Deck Builder | Free Magic: The Gathering AI - ManaTap AI',
    description: 'Build and analyze Magic: The Gathering decks with AI-powered suggestions.',
  },
};

function jsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "ManaTap AI - MTG AI Deck Builder",
    "description": "AI-powered Magic: The Gathering deck builder and analyzer. Build and analyze decks for Commander, Modern, and Standard formats with instant AI analysis, budget optimization, and personalized card suggestions.",
    "url": "https://www.manatap.ai/mtg-ai-deck-builder",
    "applicationCategory": "GameApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "AI-powered deck analysis",
      "MTG AI deck builder",
      "Commander deck builder AI",
      "Modern deck builder AI",
      "Standard deck builder AI",
      "Budget card swaps",
      "Mana curve optimization",
      "Free MTG deck analyzer"
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "150"
    }
  });
}

export default function MTGAIDeckBuilderPage() {
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
                  MTG AI Deck Builder
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 mb-4 max-w-3xl mx-auto">
                Build, analyze, and optimize Magic: The Gathering decks with AI-powered suggestions
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
                ManaTap AI is an AI-powered Magic: The Gathering deck builder that analyzes colour identity, legality, 
                synergy chains, and archetypes. Get instant deck analysis, budget swaps, and personalized recommendations 
                for Commander, Modern, and Standard formats. <strong>Free to start—no signup required.</strong>
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                <Link
                  href="/my-decks"
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                >
                  Start Building Your Deck →
                </Link>
                <Link
                  href="/mtg-commander-ai-deck-builder"
                  className="px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold text-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  Commander-Specific Tools
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
                  <span>Format-Aware (Commander, Modern, Standard)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Format Support Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            AI Deck Builder for Every MTG Format
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">👑</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Commander AI Deck Builder
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Build and analyze Commander (EDH) decks with AI that understands singleton rules, color identity, 
                and Commander-specific strategies. Get suggestions for ramp, draw, removal, and win conditions.
              </p>
              <Link
                href="/mtg-commander-ai-deck-builder"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Learn more →
              </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Modern AI Deck Builder
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Analyze Modern format decks with AI that understands the Modern metagame, card legality, 
                and competitive strategies. Get suggestions for sideboard cards and meta-specific tech.
              </p>
              <Link
                href="/my-decks"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Try Modern analyzer →
              </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="text-4xl mb-4">🏆</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Standard AI Deck Builder
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Build Standard format decks with AI that tracks current Standard legality, rotation schedules, 
                and format-specific archetypes. Get suggestions optimized for the current Standard meta.
              </p>
              <Link
                href="/my-decks"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Try Standard analyzer →
              </Link>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="bg-white dark:bg-gray-800 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
              How Our MTG AI Deck Builder Works
            </h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  AI Analyzes Card Synergy
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Our AI evaluates MTG deck synergy by analyzing card interactions, archetype patterns, and format-specific 
                  strategies. It understands how cards work together—from token strategies to aristocrat combos.
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  Format Legality Checks
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  The AI checks every card against format banlists and legality rules. For Commander, it verifies color identity. 
                  For Modern and Standard, it confirms card legality and rotation status.
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="text-4xl mb-4">💰</div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  Budget Optimization
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Get AI-powered budget swaps that maintain your deck's power level. The AI suggests cheaper alternatives 
                  that fill the same role while keeping your strategy intact.
                </p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  Mana Curve Analysis
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Visualize your deck's mana curve and get suggestions to optimize it. The AI understands format-specific 
                  curve requirements—from Commander's higher curves to Modern's aggressive low-curve builds.
                </p>
              </div>

              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  Archetype Detection
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  The AI identifies your deck's archetype—tokens, aristocrats, control, aggro, combo—and suggests cards 
                  that strengthen that strategy. It understands MTG archetypes better than generic tools.
                </p>
              </div>

              <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="text-4xl mb-4">⚡</div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  Instant Results
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Paste your decklist and get comprehensive AI analysis in seconds. No waiting, no signup required. 
                  Start optimizing your MTG deck immediately.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
              How to Use the MTG AI Deck Builder
            </h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  1
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Paste Your Decklist</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Copy your deck from Moxfield, MTGGoldfish, Archidekt, or any deck builder. 
                  Paste it into ManaTap AI—no import needed, works with any format.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  2
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Get AI Analysis</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Our AI analyzes your deck's curve, synergy, ramp, draw, removal, and win conditions. 
                  It identifies problems and suggests improvements specific to your format.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  3
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Optimize & Build</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Review AI suggestions, apply budget swaps, and optimize your deck. 
                  Save your improved decklist and share it with friends or use it in tournaments.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Build Better MTG Decks with AI?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Join thousands of Magic: The Gathering players using AI to optimize their decks. 
              Free to start, no signup required. Works for Commander, Modern, and Standard.
            </p>
            <Link
              href="/my-decks"
              className="inline-block px-8 py-4 bg-white text-gray-900 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              Start Building Your Deck Now →
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
                What is an MTG AI deck builder?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                An MTG AI deck builder uses artificial intelligence to analyze Magic: The Gathering decks, suggest improvements, 
                check format legality, and optimize card choices. ManaTap AI understands MTG archetypes, card synergies, and 
                format-specific rules to provide accurate recommendations for Commander, Modern, and Standard formats.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                How does the AI evaluate MTG deck synergy?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Our AI evaluates MTG deck synergy by analyzing card interactions, archetype patterns, and format-specific strategies. 
                It identifies cards that work together—like token producers with anthem effects, or aristocrat enablers with sacrifice outlets. 
                The AI understands MTG mechanics better than generic tools, recognizing synergy chains that human deck builders might miss.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                Does the AI check format legality?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes! The AI checks every card against format banlists and legality rules. For Commander, it verifies color identity 
                and singleton compliance. For Modern and Standard, it confirms card legality and rotation status. Unlike many AI tools, 
                ManaTap explicitly flags legality issues rather than ignoring them.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                Is the MTG AI deck builder really free?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes! Core deck analysis is free, but you need a free account signup to start analyzing decks. Some core features are available for free users, 
                while advanced features like deck version history and advanced analytics require a Pro subscription.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                What formats does the AI deck builder support?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                ManaTap AI supports Commander (EDH), Modern, and Standard formats. Each format has specific AI analysis tailored to 
                format rules, banlists, and deck construction requirements. The AI adapts its suggestions based on the format you're building for.
              </p>
            </div>
          </div>
        </div>

        {/* Related Resources */}
        <div className="bg-gray-50 dark:bg-gray-900 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
              Learn More About AI & MTG Deck Building
            </h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link
                href="/blog/why-ai-can-help-with-mtg-deck-building"
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                  Why AI Can Help With MTG Deck Building
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Learn how AI is transforming Magic: The Gathering deck building and where it needs improvement.
                </p>
              </Link>

              <Link
                href="/mtg-commander-ai-deck-builder"
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                  Commander-Specific AI Tools
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Deep dive into Commander deck building with AI that understands EDH-specific rules and strategies.
                </p>
              </Link>

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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
