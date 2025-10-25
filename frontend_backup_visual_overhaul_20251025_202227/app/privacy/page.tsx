'use client';
import React, { useState, useEffect } from 'react';

function formatToday(): string {
  try {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

export default function PrivacyPage() {
  const today = formatToday();
  const [analyticsConsent, setAnalyticsConsent] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
    try {
      const consent = window.localStorage.getItem('analytics:consent') === 'granted';
      setAnalyticsConsent(consent);
    } catch {}
  }, []);

  const toggleAnalytics = (enabled: boolean) => {
    try {
      if (enabled) {
        window.localStorage.setItem('analytics:consent', 'granted');
        window.dispatchEvent(new Event('analytics:consent-granted'));
      } else {
        window.localStorage.removeItem('analytics:consent');
        window.dispatchEvent(new Event('analytics:consent-revoked'));
      }
      setAnalyticsConsent(enabled);
    } catch (e) {
      console.error('Failed to update analytics consent:', e);
    }
  };

  const togglePanel = (panelId: string) => {
    setExpandedPanels(prev => ({
      ...prev,
      [panelId]: !prev[panelId]
    }));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-invert">
      <h1>Privacy Policy (Manatap.ai)</h1>
      <p><strong>Effective date:</strong> {today}</p>
      <p>Manatap.ai is a free, personal project created to help Magic: The Gathering players explore deck ideas and costs.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
        <div>
          <h2 className="text-xl font-semibold mb-3">What data we collect</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Basic usage data (page visits, actions) through analytics tools</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Account data if you create one (email, login via Supabase)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <span>Payment info via Ko-fi, PayPal, or Stripe (we don't store card details)</span>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">How we use it</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-1">•</span>
              <span>Keep the site running and fix bugs</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-1">•</span>
              <span>Process donations via third-party providers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-1">•</span>
              <span>Protect against abuse or misuse</span>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Who we share data with</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Hosting and database (Supabase, Render)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Payment processors (Ko-fi, PayPal, Stripe)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">•</span>
              <span>Analytics (PostHog)</span>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Your rights</h2>
          <p className="text-sm">
            If you're in the UK/EU, you can request a copy of your personal data or ask us to delete it.
          </p>
          <a href="mailto:support@manatap.ai" className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300 underline">
            Contact us: support@manatap.ai
          </a>
        </div>
      </div>

      <h2>Cookies & Tracking</h2>
      <p>We use strictly necessary cookies for authentication and preference storage, and optional analytics cookies with your consent.</p>

      {/* Cookie Consent Toggle */}
      {mounted && (
        <div className="not-prose my-6 p-4 rounded-lg border border-neutral-700 bg-neutral-900">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-white mb-1">Analytics Cookies</div>
              <div className="text-xs text-neutral-400">
                Allow optional analytics to help improve ManaTap
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                className="sr-only"
                checked={analyticsConsent}
                onChange={(e) => toggleAnalytics(e.target.checked)}
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${analyticsConsent ? 'bg-emerald-600' : 'bg-neutral-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${analyticsConsent ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Vendor Details */}
      <div className="not-prose space-y-4 my-6">
        {/* Supabase */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
          <button
            onClick={() => togglePanel('supabase')}
            className="w-full p-4 flex items-start gap-3 hover:bg-neutral-900/50 transition-colors text-left"
          >
            <span className="text-2xl">🔐</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">
                Supabase (Authentication)
              </h3>
            </div>
            <span className="text-neutral-400">{expandedPanels['supabase'] ? '▼' : '▶'}</span>
          </button>
          {expandedPanels['supabase'] && (
            <div className="px-4 pb-4 pl-16 text-xs text-neutral-400 space-y-1">
              <div><strong className="text-neutral-300">Purpose:</strong> Session management and user authentication</div>
              <div><strong className="text-neutral-300">Cookies:</strong> <code className="text-neutral-300 bg-neutral-800 px-1 rounded">sb-*-auth-token</code></div>
              <div><strong className="text-neutral-300">Duration:</strong> Session (expires on logout)</div>
              <div><strong className="text-neutral-300">Type:</strong> Strictly necessary</div>
              <div>
                <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* PostHog */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
          <button
            onClick={() => togglePanel('posthog')}
            className="w-full p-4 flex items-start gap-3 hover:bg-neutral-900/50 transition-colors text-left"
          >
            <span className="text-2xl">📊</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">
                PostHog (Analytics)
              </h3>
            </div>
            <span className="text-neutral-400">{expandedPanels['posthog'] ? '▼' : '▶'}</span>
          </button>
          {expandedPanels['posthog'] && (
            <div className="px-4 pb-4 pl-16 text-xs text-neutral-400 space-y-1">
              <div><strong className="text-neutral-300">Purpose:</strong> Anonymized usage analytics and feature improvement</div>
              <div><strong className="text-neutral-300">Cookies:</strong> <code className="text-neutral-300 bg-neutral-800 px-1 rounded">ph_*</code></div>
              <div><strong className="text-neutral-300">Duration:</strong> 1 year</div>
              <div><strong className="text-neutral-300">Type:</strong> Optional (requires consent)</div>
              <div><strong className="text-neutral-300">Endpoints:</strong> eu.i.posthog.com, eu-assets.i.posthog.com</div>
              <div>
                <button 
                  onClick={() => {
                    toggleAnalytics(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-blue-400 hover:text-blue-300 underline text-xs"
                >
                  Opt-out (disable analytics) →
                </button>
              </div>
              <div>
                <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Stripe */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
          <button
            onClick={() => togglePanel('stripe')}
            className="w-full p-4 flex items-start gap-3 hover:bg-neutral-900/50 transition-colors text-left"
          >
            <span className="text-2xl">💳</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">
                Stripe (Payments)
              </h3>
            </div>
            <span className="text-neutral-400">{expandedPanels['stripe'] ? '▼' : '▶'}</span>
          </button>
          {expandedPanels['stripe'] && (
            <div className="px-4 pb-4 pl-16 text-xs text-neutral-400 space-y-1">
              <div><strong className="text-neutral-300">Purpose:</strong> Secure payment processing and subscription management</div>
              <div><strong className="text-neutral-300">Cookies:</strong> Set during checkout and customer portal sessions</div>
              <div><strong className="text-neutral-300">Duration:</strong> Session-based</div>
              <div><strong className="text-neutral-300">Type:</strong> Strictly necessary (for payments only)</div>
              <div><strong className="text-neutral-300">Note:</strong> We do not store payment card details</div>
              <div>
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Scryfall */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
          <button
            onClick={() => togglePanel('scryfall')}
            className="w-full p-4 flex items-start gap-3 hover:bg-neutral-900/50 transition-colors text-left"
          >
            <span className="text-2xl">🃏</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">
                Scryfall (Card Data & Images)
              </h3>
            </div>
            <span className="text-neutral-400">{expandedPanels['scryfall'] ? '▼' : '▶'}</span>
          </button>
          {expandedPanels['scryfall'] && (
            <div className="px-4 pb-4 pl-16 text-xs text-neutral-400 space-y-1">
              <div><strong className="text-neutral-300">Purpose:</strong> Card images, prices, and metadata</div>
              <div><strong className="text-neutral-300">Cookies:</strong> None set by ManaTap</div>
              <div><strong className="text-neutral-300">Type:</strong> External API requests</div>
              <div><strong className="text-neutral-300">Endpoints:</strong> api.scryfall.com, cards.scryfall.io</div>
              <div>
                <a href="https://scryfall.com/docs/api" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  API Documentation →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Ko-fi */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
          <button
            onClick={() => togglePanel('kofi')}
            className="w-full p-4 flex items-start gap-3 hover:bg-neutral-900/50 transition-colors text-left"
          >
            <span className="text-2xl">☕</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">
                Ko-fi (Donations)
              </h3>
            </div>
            <span className="text-neutral-400">{expandedPanels['kofi'] ? '▼' : '▶'}</span>
          </button>
          {expandedPanels['kofi'] && (
            <div className="px-4 pb-4 pl-16 text-xs text-neutral-400 space-y-1">
              <div><strong className="text-neutral-300">Purpose:</strong> Optional donation link</div>
              <div><strong className="text-neutral-300">Cookies:</strong> None (link only, no widget)</div>
              <div><strong className="text-neutral-300">Type:</strong> External link</div>
              <div>
                <a href="https://ko-fi.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Visit Ko-fi →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-neutral-400">
        You can also toggle analytics/data sharing in your{' '}
        <a href="/profile" className="text-blue-400 hover:text-blue-300 underline">
          Profile → Security/Privacy
        </a>{' '}
        panel.
      </p>

      <h2>Legal Compliance</h2>
      <p>We comply with UK and EU data protection laws (GDPR). Contact us for access or deletion requests.</p>
    </div>
  );
}
