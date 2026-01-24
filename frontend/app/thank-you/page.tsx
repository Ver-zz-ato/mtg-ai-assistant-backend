'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';
import Link from 'next/link';

function ThankYouContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { isPro, loading: proLoading } = useProStatus();
  
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  
  const sessionId = searchParams.get('session_id');
  const plan = searchParams.get('plan') || 'monthly';

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      // Redirect to pricing if not logged in
      router.push('/pricing');
      return;
    }

    // If we have a session_id, immediately sync Pro status
    if (sessionId && !synced) {
      const syncProStatus = async () => {
        try {
          setSyncing(true);
          setSyncError(null);
          
          const res = await fetch(`/api/billing/confirm-payment?session_id=${sessionId}`);
          const data = await res.json();
          
          if (data.ok && data.isPro) {
            setSynced(true);
            // Force hard refresh after a short delay to ensure all components recognize Pro status
            setTimeout(() => {
              // Hard refresh: clear cache and reload
              window.location.href = window.location.pathname + window.location.search;
            }, 1000);
          } else {
            setSyncError(data.error || 'Failed to sync Pro status');
            setSyncing(false);
          }
        } catch (error: any) {
          console.error('Failed to sync Pro status:', error);
          setSyncError(error.message || 'Failed to sync Pro status');
          setSyncing(false);
        }
      };
      
      syncProStatus();
    } else if (!sessionId) {
      // No session_id - just check if already Pro
      setSyncing(false);
    }
  }, [user, authLoading, sessionId, synced, router]);

  // Show loading state while syncing
  if (authLoading || syncing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
          <div className="text-xl font-semibold">Activating your Pro membership...</div>
          <div className="text-sm text-blue-200 mt-2">This will only take a moment</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (syncError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center text-white">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">Payment Confirmed</h1>
          <p className="text-blue-200 mb-6">
            Your payment was successful, but we encountered an issue syncing your Pro status.
          </p>
          <p className="text-sm text-blue-300 mb-6">
            Don't worry - your Pro access will be activated automatically within a few minutes.
            If you continue to see this message, please contact support.
          </p>
          <div className="space-y-3">
            <Link
              href="/pricing"
              className="block w-full bg-white text-blue-600 py-3 px-6 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Go to Pricing
            </Link>
            <Link
              href="/"
              className="block w-full bg-white/20 text-white py-3 px-6 rounded-lg font-semibold hover:bg-white/30 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state - show thank you message
  const planName = plan === 'yearly' ? 'Yearly' : 'Monthly';
  const planPrice = plan === 'yearly' ? '£14.99/year' : '£1.99/month';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Success Header */}
          <div className="text-center mb-12">
            <div className="text-8xl mb-6 animate-bounce">🎉</div>
            <h1 className="text-5xl font-bold text-white mb-4">
              Welcome to ManaTap AI Pro!
            </h1>
            <p className="text-xl text-blue-200 mb-2">
              Thank you for your support!
            </p>
            <p className="text-lg text-blue-300">
              Your {planName} Pro subscription is now active
            </p>
          </div>

          {/* Pro Features Grid */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">
              🚀 You Now Have Access To:
            </h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { icon: '🤖', title: 'Unlimited AI Analysis', desc: 'Get unlimited AI-powered deck analysis and suggestions' },
                { icon: '📊', title: 'Advanced Deck Statistics', desc: 'Deep insights into your deck\'s performance and composition' },
                { icon: '💾', title: 'Deck Versioning', desc: 'Save snapshots and restore previous versions of your decks' },
                { icon: '💰', title: 'Price Tracking & Alerts', desc: 'Track card prices and get alerts when prices change' },
                { icon: '🎯', title: 'Hand Testing Widget', desc: 'Interactive London mulligan simulation with real card artwork' },
                { icon: '🔍', title: 'AI Deck Comparison', desc: 'Compare multiple decks with AI-powered insights' },
                { icon: '⭐', title: 'Pro Badge & Early Access', desc: 'Show your Pro status and get early access to new features' },
                { icon: '💬', title: 'Priority Support', desc: 'Get faster response times and priority help when you need it' },
              ].map((feature, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{feature.icon}</span>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                      <p className="text-sm text-blue-200">{feature.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/my-decks"
              className="bg-white text-blue-600 py-4 px-8 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors text-center"
            >
              Start Building Decks →
            </Link>
            <Link
              href="/pricing"
              className="bg-white/20 text-white border-2 border-white py-4 px-8 rounded-lg font-bold text-lg hover:bg-white/30 transition-colors text-center"
            >
              Manage Subscription
            </Link>
          </div>

          {/* Subscription Info */}
          <div className="mt-8 text-center text-blue-200 text-sm">
            <p>Your {planName} Pro subscription ({planPrice}) is now active.</p>
            <p className="mt-2">You can manage your subscription anytime from your account settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
          <div className="text-xl font-semibold">Loading...</div>
        </div>
      </div>
    }>
      <ThankYouContent />
    </Suspense>
  );
}
