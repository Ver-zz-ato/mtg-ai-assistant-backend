import AuthGateExample from '@/components/AuthGateExample';
import { 
  MulliganCoachBubble, 
  BudgetSwapsCoachBubble, 
  CostToFinishCoachBubble 
} from '@/components/CoachBubble';
import {
  NoDecksEmptyState,
  NoCollectionsEmptyState,
  NoWishlistItemsEmptyState,
  NoChatHistoryEmptyState,
  NoCostToFinishEmptyState,
} from '@/components/EmptyState';
import RateLimitMessage, { RateLimitBanner } from '@/components/RateLimitMessage';

export default function TestComponentsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="max-w-6xl mx-auto px-4 space-y-16">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Component Testing Page
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Test all Phase 1 components in one place
          </p>
        </div>

        {/* Auth Gate */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-4">1. Auth Gate</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Click the button to trigger the auth gate (appears in bottom-right corner)
          </p>
          <AuthGateExample />
        </section>

        {/* Coach Bubbles */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-4">2. Coach Bubbles</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Coach bubbles appear after 3 seconds. They show in the bottom-right corner.
            Refresh the page to see them again (they're session-based).
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="font-semibold mb-2">Mulligan Coach</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Appears on deck pages after 3 seconds
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="font-semibold mb-2">Budget Swaps Coach</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Random 50% chance on My Decks
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="font-semibold mb-2">Cost to Finish Coach</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Appears on Collections page
              </p>
            </div>
          </div>
          
          {/* Manually trigger coach bubbles for demo */}
          <div className="mt-4">
            <MulliganCoachBubble />
          </div>
        </section>

        {/* Empty States */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6">3. Empty States</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            These appear when there's no data to display.
          </p>
          
          <div className="space-y-8">
            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">No Decks</h3>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <NoDecksEmptyState />
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">No Collections</h3>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <NoCollectionsEmptyState />
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">No Wishlist Items</h3>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <NoWishlistItemsEmptyState />
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">No Chat History</h3>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <NoChatHistoryEmptyState />
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">No Cost to Finish Selected</h3>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <NoCostToFinishEmptyState />
              </div>
            </div>
          </div>
        </section>

        {/* Rate Limiting */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6">4. Rate Limit Messages</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Shows when users hit rate limits. Countdown timer and helpful suggestions.
          </p>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">Full Message (60 seconds)</h3>
              <RateLimitMessage retryAfter={60} feature="AI deck analysis" />
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-sm text-gray-500">Compact Banner (5 minutes)</h3>
              <RateLimitBanner timeLeft={300} feature="budget swaps" />
            </div>
          </div>
        </section>

        {/* Test on Real Pages */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Test on Real Pages</h2>
          <p className="mb-6">Visit these pages to see components in action:</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="/my-decks" className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100">
              My Decks (Empty State + Coach)
            </a>
            <a href="/collections" className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100">
              Collections (Empty State + Coach)
            </a>
            <a href="/wishlist" className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100">
              Wishlist (Empty State)
            </a>
            <a href="/blog" className="px-4 py-2 bg-white/20 backdrop-blur text-white rounded-lg font-semibold hover:bg-white/30">
              Blog
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

