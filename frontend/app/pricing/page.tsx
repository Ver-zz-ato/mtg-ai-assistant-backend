'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-client';
import { usePro } from '@/components/ProContext';
import { capture } from '@/lib/ph';
import Link from 'next/link';

export default function PricingPage() {
  const { isPro, loading: proLoading } = usePro();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    // Track page view
    capture('pricing_page_viewed', {
      is_authenticated: !!user,
      is_pro: isPro,
    });
  }, [user, isPro]);

  const handleUpgradeClick = () => {
    capture('pricing_upgrade_clicked', {
      is_authenticated: !!user,
      source: 'pricing_page',
    });
    // Add your upgrade logic here
    alert('Upgrade flow coming soon!');
  };

  const features = [
    {
      icon: '🚀',
      title: 'Unlimited AI Analysis',
      description: 'Get unlimited deck analysis, card suggestions, and strategic insights',
      free: 'Limited to 5 per day',
      pro: 'Unlimited'
    },
    {
      icon: '📊',
      title: 'Advanced Deck Statistics',
      description: 'Detailed mana curve analysis, win rate predictions, and meta insights',
      free: 'Basic stats only',
      pro: 'Full analytics suite'
    },
    {
      icon: '💡',
      title: 'Smart Card Recommendations',
      description: 'AI-powered suggestions for deck improvements and optimal builds',
      free: '3 suggestions per deck',
      pro: 'Unlimited suggestions'
    },
    {
      icon: '🔍',
      title: 'Collection Insights',
      description: 'Track collection value, identify missing cards, and optimize trades',
      free: 'Basic collection tracking',
      pro: 'Full market insights'
    },
    {
      icon: '📈',
      title: 'Price Tracking & Alerts',
      description: 'Monitor card prices, get alerts on price changes, and optimize purchases',
      free: 'View current prices',
      pro: 'Full price history & alerts'
    },
    {
      icon: '🎯',
      title: 'Personalized Recommendations',
      description: 'Get deck suggestions tailored to your playstyle and collection',
      free: 'Generic suggestions',
      pro: 'Personalized AI recommendations'
    },
    {
      icon: '⚡',
      title: 'Priority Support',
      description: 'Get faster responses and priority access to new features',
      free: 'Community support',
      pro: 'Priority email support'
    },
    {
      icon: '🌟',
      title: 'Pro Badge & Features',
      description: 'Show your support with a Pro badge and early access to beta features',
      free: false,
      pro: 'Exclusive Pro features'
    }
  ];

  if (loading || proLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Unlock Your MTG Potential
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Take your Magic: The Gathering experience to the next level with ManaTap AI Pro. 
            Get unlimited AI analysis, advanced insights, and premium features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16 max-w-4xl mx-auto">
          {/* Free Tier */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Free</h3>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">$0</div>
              <div className="text-gray-600 dark:text-gray-400">Forever</div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span className="text-sm">Basic deck analysis (5/day)</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span className="text-sm">Collection tracking</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span className="text-sm">Current card prices</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span className="text-sm">Community support</span>
              </div>
            </div>

            {!user ? (
              <Link href="/profile" className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white py-3 px-6 rounded-lg font-medium text-center block hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Get Started Free
              </Link>
            ) : (
              <div className="w-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 py-3 px-6 rounded-lg font-medium text-center">
                Current Plan
              </div>
            )}
          </div>

          {/* Pro Tier */}
          <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-full">
              POPULAR
            </div>
            
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-4">Pro</h3>
              <div className="text-4xl font-bold mb-2">$9.99</div>
              <div className="text-blue-100">per month</div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Everything in Free</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Unlimited AI analysis</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Advanced deck statistics</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Price tracking & alerts</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Priority support</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Pro badge & early access</span>
              </div>
            </div>

            {isPro ? (
              <div className="w-full bg-white bg-opacity-20 text-white py-3 px-6 rounded-lg font-medium text-center">
                ✓ Active Pro Member
              </div>
            ) : (
              <button 
                onClick={handleUpgradeClick}
                className="w-full bg-white text-blue-600 py-3 px-6 rounded-lg font-bold hover:bg-gray-100 transition-colors"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>

        {/* Feature Comparison */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 mb-16 border border-gray-200 dark:border-gray-700">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Feature Comparison
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-4 text-gray-900 dark:text-white font-medium">Feature</th>
                  <th className="text-center py-4 text-gray-600 dark:text-gray-400 font-medium">Free</th>
                  <th className="text-center py-4 text-blue-600 font-medium">Pro</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-6">
                      <div className="flex items-start space-x-3">
                        <span className="text-2xl">{feature.icon}</span>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white mb-1">
                            {feature.title}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {feature.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 text-center">
                      {feature.free ? (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {feature.free}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-6 text-center">
                      <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                        {feature.pro}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-6">
            Ready to Level Up Your MTG Game?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of players who are already using ManaTap AI Pro to improve their decks and win more games.
          </p>
          
          {!isPro && (
            <button 
              onClick={handleUpgradeClick}
              className="bg-white text-blue-600 py-4 px-8 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors"
            >
              Start Your Pro Journey
            </button>
          )}

          {isPro && (
            <div className="text-xl font-bold">
              🎉 You're already a Pro member! Thanks for your support!
            </div>
          )}
        </div>

        {/* FAQ Section */}
        <div className="mt-16 bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                Can I cancel anytime?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Yes! You can cancel your Pro subscription at any time. You'll retain Pro access until the end of your billing period.
              </p>
            </div>
            
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                We accept all major credit cards and PayPal for your convenience.
              </p>
            </div>
            
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                Is there a free trial?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Our Free tier gives you a great taste of what ManaTap AI can do. Upgrade to Pro when you're ready for more!
              </p>
            </div>
            
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                Do you offer discounts?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                We occasionally offer special promotions. Follow us or check back for seasonal discounts!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}