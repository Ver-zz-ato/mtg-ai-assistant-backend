'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';
import Link from 'next/link';
import { captureProEvent, getActiveProFeature } from '@/lib/analytics-pro';
import { clearActiveWorkflow, getCurrentWorkflowRunId } from '@/lib/analytics/workflow-abandon';

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
    
    // Log diagnostic info (always log for debugging - not suppressed)
    const isDev = process.env.NODE_ENV !== 'production';
    console.log('[thank-you] 🔍 Page loaded', {
      currentHost: window.location.host,
      currentUrl: window.location.href,
      isAuthenticated: !!user,
      userId: user?.id,
      sessionId,
      plan,
      isDev,
      nodeEnv: process.env.NODE_ENV,
    });
    
    if (!user) {
      // Log auth issue (always log for debugging)
      console.warn('[thank-you] ⚠️ User not authenticated', {
        currentHost: window.location.host,
        expectedHost: 'www.manatap.ai',
        domainMismatch: !window.location.host.includes('www.manatap.ai') && !window.location.host.includes('localhost'),
      });
      // Redirect to pricing if not logged in
      router.push('/pricing');
      return;
    }

    // Check if we've already synced this session (prevent infinite loop)
    const syncKey = sessionId ? `pro_synced_${sessionId}` : null;
    const alreadySynced = syncKey ? sessionStorage.getItem(syncKey) === 'true' : false;
    
    // Also check if user is already Pro (no need to sync again)
    if (isPro && !sessionId) {
      console.log('[thank-you] ✅ User already Pro, no sync needed');
      setSyncing(false);
      return;
    }

    // If we have a session_id and haven't synced yet, immediately sync Pro status
    if (sessionId && !synced && !alreadySynced) {
      const syncProStatus = async () => {
        try {
          setSyncing(true);
          setSyncError(null);
          
          // Use cache: 'no-store' to prevent Next.js caching
          const res = await fetch(`/api/billing/confirm-payment?session_id=${sessionId}`, {
            cache: 'no-store',
          });
          const data = await res.json();
          
          // Log response (always log for debugging)
          console.log('[thank-you] 🔍 confirm-payment response', {
            status: res.status,
            ok: data.ok,
            code: data.code,
            error: data.error,
            isPro: data.isPro,
            fullResponse: data, // Include full response for debugging
          });
          
          if (data.ok && data.isPro) {
            if (syncKey) sessionStorage.setItem(syncKey, 'true');
            setSynced(true);
            setSyncing(false);
            const runId = getCurrentWorkflowRunId();
            clearActiveWorkflow();
            try {
              const proFeature = getActiveProFeature();
              captureProEvent('pro_upgrade_completed', {
                pro_feature: proFeature ?? undefined,
                source_path: window.location.pathname + window.location.search,
                plan_suggested: plan || 'monthly',
                gate_location: 'thank_you_page',
                workflow_run_id: runId ?? undefined,
              } as any);
            } catch {}
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('session_id');
            window.history.replaceState({}, '', newUrl.toString());
            console.log('[thank-you] ✅ Pro status synced successfully, showing success page');
          } else {
            // Enhanced error handling with specific messages
            let errorMessage = data.error || 'Failed to sync Pro status';
            let showDomainHelp = false;
            
            if (res.status === 401 || res.status === 403) {
              if (data.code === 'AUTH_REQUIRED' || data.code === 'OWNERSHIP_MISMATCH') {
                errorMessage = 'Authentication issue detected. You may be logged out on this domain.';
                showDomainHelp = true;
              }
            }
            
            setSyncError(errorMessage);
            if (showDomainHelp) {
              // Store domain help flag for UI
              (window as any).__proSyncDomainIssue = true;
            }
            setSyncing(false);
          }
        } catch (error: any) {
          console.error('Failed to sync Pro status:', error);
          setSyncError(error.message || 'Failed to sync Pro status');
          setSyncing(false);
        }
      };
      
      syncProStatus();
    } else if (alreadySynced) {
      // Already synced - just show success
      console.log('[thank-you] ✅ Already synced this session, showing success');
      setSynced(true);
      setSyncing(false);
    } else if (!sessionId) {
      // No session_id - just check if already Pro
      setSyncing(false);
    }
  }, [user, authLoading, sessionId, synced, isPro, router]);

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
    const showDomainHelp = (window as any).__proSyncDomainIssue;
    const canonicalUrl = `https://www.manatap.ai/thank-you?session_id=${sessionId}&plan=${plan}`;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center text-white">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">Payment Confirmed</h1>
          <p className="text-blue-200 mb-6">
            {syncError}
          </p>
          
          {showDomainHelp && (
            <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-amber-200 mb-2 font-semibold">Domain/Cookie Issue Detected</p>
              <p className="text-xs text-amber-300 mb-3">
                You appear logged out on this domain. This can happen if you're on a different subdomain (www vs non-www).
              </p>
              <p className="text-xs text-amber-300 mb-3">
                Try opening this link in the same browser session:
              </p>
              <a
                href={canonicalUrl}
                className="text-xs text-blue-300 underline break-all block"
              >
                {canonicalUrl}
              </a>
            </div>
          )}
          
          <p className="text-sm text-blue-300 mb-6">
            Don't worry - your Pro access will be activated automatically within a few minutes via webhook.
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
