'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { usePro } from '@/components/ProContext';
import { capture } from '@/lib/ph';
import { trackPricingPageViewed, trackUpgradeAbandoned } from '@/lib/analytics-enhanced';
import Link from 'next/link';
import ProValueTooltip from '@/components/ProValueTooltip';

export default function PricingPage() {
  const { isPro } = usePro();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    console.log('[Pricing] Starting auth check...');
    
    // No timeout needed - fixed root cause of race conditions
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error('[Pricing] Session error:', error);
        }
        
        const currentUser = session?.user || null;
        console.log('[Pricing] Auth check complete', { hasUser: !!currentUser, email: currentUser?.email });
        setUser(currentUser);
        setLoading(false);

        // Enhanced pricing page tracking
        const referrer = typeof document !== 'undefined' ? document.referrer : '';
        const source = referrer.includes('/chat') ? 'chat_limit' :
                      referrer.includes('/my-decks') ? 'deck_feature' :
                      referrer.includes('google') ? 'google_search' : 'direct';
        
        trackPricingPageViewed(source);
        capture('pricing_page_viewed', {
          is_authenticated: !!currentUser,
          is_pro: isPro,
          source,
          referrer: referrer.slice(0, 100) // Truncate for privacy
        });
      })
      .catch((err) => {
        console.error('[Pricing] Auth error:', err);
        setUser(null);
        setLoading(false);
      });
  }, []); // Empty deps - auth check runs once at mount

  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');

  const handleUpgradeClick = async (plan: 'monthly' | 'yearly') => {
    if (!user) {
      alert('Please sign in first to upgrade.');
      return;
    }

    capture('pricing_upgrade_clicked', {
      is_authenticated: !!user,
      source: 'pricing_page',
      plan,
    });

    setUpgrading(true);
    
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Upgrade failed:', error);
      trackUpgradeAbandoned('payment', error.message || 'payment_error');
      alert(error.message || 'Failed to start upgrade process. Please try again.');
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    if (!user) return;

    capture('billing_portal_clicked', {
      source: 'pricing_page',
    });

    setManagingBilling(true);

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to open billing portal');
      }

      // Redirect to Stripe Customer Portal
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Billing portal failed:', error);
      alert(error.message || 'Failed to open billing portal. Please try again.');
    } finally {
      setManagingBilling(false);
    }
  };

  const features = [
    {
      icon: '🎯',
      title: 'Hand Testing Widget',
      description: 'Interactive London mulligan simulation with real MTG card artwork',
      free: false,
      pro: 'Full simulator'
    },
    {
      icon: '📊',
      title: 'Deck Probability Analysis',
      description: 'Advanced probability calculations and statistical insights',
      free: 'View only',
      pro: 'Full calculations'
    },
    {
      icon: '💡',
      title: 'AI Budget Swaps',
      description: 'Smart card suggestions to optimize your deck within budget',
      free: 'Basic swaps',
      pro: 'AI-powered + Export'
    },
    {
      icon: '🔧',
      title: 'Fix Card Names',
      description: 'Automatically fix and normalize card names in collections and decks',
      free: false,
      pro: 'Batch processing'
    },
    {
      icon: '📈',
      title: 'Price Snapshots',
      description: 'Historical price tracking and trend analysis',
      free: 'Current prices only',
      pro: 'Full history + alerts'
    },
    {
      icon: '📋',
      title: 'Export to Moxfield/MTGO',
      description: 'Export your decks and collections to popular platforms',
      free: false,
      pro: 'All formats'
    },
    {
      icon: '🛠️',
      title: 'Collection Bulk Operations',
      description: 'Set to playset, batch fixes, and advanced collection management',
      free: 'Basic editing',
      pro: 'Bulk operations'
    },
    {
      icon: '🎲',
      title: 'AI Deck Assistant',
      description: 'Advanced AI-powered deck building and optimization suggestions',
      free: 'Basic suggestions',
      pro: 'Auto-toggle + Pro features'
    },
    {
      icon: '📊',
      title: 'Advanced Analytics',
      description: 'Price trend sparklines, watchlists, and deck value tracking',
      free: 'Basic stats',
      pro: 'Full analytics suite'
    },
    {
      icon: '🌟',
      title: 'Pro Badge & Priority',
      description: 'Show your support with a Pro badge and priority feature access',
      free: false,
      pro: 'Exclusive Pro features'
    }
  ];

  if (loading) {
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
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Take your Magic: The Gathering experience to the next level with ManaTap AI Pro. 
            Get unlimited AI analysis, advanced insights, and premium features.
          </p>

          {/* Billing Interval Toggle */}
          <div className="inline-flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl p-2 shadow-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setBillingInterval('monthly');
                capture('pricing_interval_changed', { interval: 'monthly' });
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => {
                setBillingInterval('annual');
                capture('pricing_interval_changed', { interval: 'annual' });
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all relative ${
                billingInterval === 'annual'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Annual
              <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                Save 20%
              </span>
            </button>
          </div>
          
          {billingInterval === 'annual' && (
            <div className="mt-4 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Save £8.89/year with annual billing (37% off)
            </div>
          )}
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
              {billingInterval === 'monthly' ? (
                <>
                  <div className="text-5xl font-bold mb-2">£1.99</div>
                  <div className="text-blue-100">per month</div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="text-3xl font-bold line-through opacity-60">£23.88</div>
                    <div className="text-5xl font-bold">£14.99</div>
                  </div>
                  <div className="text-blue-100 mb-1">per year</div>
                  <div className="text-sm text-emerald-300 font-semibold">
                    💰 Just £1.25/month - Save £8.89/year (37%)
                  </div>
                </>
              )}
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <span className="text-sm">Everything in Free</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <ProValueTooltip
                  trigger={
                    <span className="text-sm cursor-help border-b border-dotted border-white border-opacity-50">Unlimited AI analysis</span>
                  }
                  featureName="Unlimited AI Analysis"
                  benefits={[
                    'No daily limits on deck analysis',
                    'Advanced AI-powered suggestions',
                    'Real-time optimization recommendations',
                    'Access to latest AI models and improvements'
                  ]}
                  placement="right"
                />
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <ProValueTooltip
                  trigger={
                    <span className="text-sm cursor-help border-b border-dotted border-white border-opacity-50">Advanced deck statistics</span>
                  }
                  featureName="Advanced Deck Statistics"
                  benefits={[
                    'Detailed probability calculations',
                    'Mana curve optimization analysis',
                    'Win condition tracking',
                    'Performance metrics and trends'
                  ]}
                  placement="right"
                />
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-3">✓</span>
                <ProValueTooltip
                  trigger={
                    <span className="text-sm cursor-help border-b border-dotted border-white border-opacity-50">Price tracking & alerts</span>
                  }
                  featureName="Price Tracking & Alerts"
                  benefits={[
                    'Historical price data for all cards',
                    'Custom price alert thresholds',
                    'Market trend analysis and predictions',
                    'Portfolio value tracking over time'
                  ]}
                  placement="right"
                />
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
              <button
                onClick={handleManageBilling}
                disabled={managingBilling}
                className="w-full bg-white bg-opacity-20 text-white py-3 px-6 rounded-lg font-medium hover:bg-opacity-30 transition-colors disabled:opacity-50"
              >
                {managingBilling ? 'Opening...' : 'Manage Billing'}
              </button>
            ) : (
              <button 
                onClick={() => handleUpgradeClick(billingInterval === 'monthly' ? 'monthly' : 'yearly')}
                disabled={upgrading}
                className="w-full bg-white text-blue-600 py-3 px-6 rounded-lg font-bold hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {upgrading ? 'Processing...' : 
                  billingInterval === 'monthly' 
                    ? 'Upgrade to Pro - £1.99/mo' 
                    : 'Upgrade to Pro - £14.99/yr'}
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
                      <ProValueTooltip
                        trigger={
                          <span className="text-sm text-blue-600 dark:text-blue-400 font-medium cursor-help border-b border-dotted border-blue-400">
                            {feature.pro}
                          </span>
                        }
                        featureName={feature.title}
                        benefits={[
                          feature.description,
                          feature.title.includes('AI') ? 'Powered by advanced machine learning' : 'Professional-grade tools',
                          feature.title.includes('Export') ? 'Multiple format support' : 'Unlimited usage',
                          'Priority customer support'
                        ]}
                        placement="top"
                      />
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
              onClick={() => handleUpgradeClick(billingInterval === 'monthly' ? 'monthly' : 'yearly')}
              disabled={upgrading}
              className="bg-white text-blue-600 py-4 px-8 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {upgrading ? 'Processing...' : 
                billingInterval === 'monthly' 
                  ? 'Start Your Pro Journey - £1.99/mo' 
                  : 'Start Your Pro Journey - £14.99/yr (Save 37%)'}
            </button>
          )}

          {isPro && (
            <div className="space-y-4">
              <div className="text-xl font-bold">
                🎉 You're already a Pro member! Thanks for your support!
              </div>
              <button
                onClick={handleManageBilling}
                disabled={managingBilling}
                className="bg-white bg-opacity-20 text-white py-3 px-6 rounded-lg font-medium hover:bg-opacity-30 transition-colors disabled:opacity-50"
              >
                {managingBilling ? 'Opening...' : 'Manage Your Subscription'}
              </button>
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