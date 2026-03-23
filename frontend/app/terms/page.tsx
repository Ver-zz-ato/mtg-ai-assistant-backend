import React from 'react';
import Link from 'next/link';

// Force dynamic rendering to avoid DYNAMIC_SERVER_USAGE errors with Date formatting
export const dynamic = 'force-dynamic';

function formatToday(): string {
  try {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

export default function TermsPage() {
  const today = formatToday();
  
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">
            Terms of Service
          </h1>
          <p className="text-gray-400">
            Effective date: {today}
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 mb-6">
          <p className="text-base text-gray-300 mb-6">
            <strong>By using Manatap.ai on the web or the ManaTap mobile app, you agree to the following:</strong>
          </p>

          <div className="space-y-4">
            {/* Free Project */}
            <div className="bg-blue-900/20 rounded-xl p-4 border-l-4 border-blue-600">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🆓</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Free Project
                  </h3>
                  <p className="text-gray-300">
                    Manatap.ai is offered "as is" without guarantees. It may change or stop at any time.
                  </p>
                </div>
              </div>
            </div>

            {/* No Liability */}
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border-l-4 border-amber-600">
              <div className="flex items-start gap-3">
                <div className="text-2xl">⚠️</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    No Liability
                  </h3>
                  <p className="text-gray-300">
                    We're not responsible for losses, damages, or mistakes that come from using the site.
                  </p>
                </div>
              </div>
            </div>

            {/* Fair Use */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border-l-4 border-green-600">
              <div className="flex items-start gap-3">
                <div className="text-2xl">✅</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Fair Use
                  </h3>
                  <p className="text-gray-300">
                    Don&apos;t abuse ManaTap (e.g. spamming, exploiting the system, or attempting to break security)—on the website or in the app.
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile app */}
            <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-4 border-l-4 border-slate-500">
              <div className="flex items-start gap-3">
                <div className="text-2xl">📱</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Mobile app (iOS &amp; Android)
                  </h3>
                  <p className="text-gray-300">
                    The ManaTap mobile app (Expo/React Native) connects to the same services described in our{' '}
                    <Link href="/privacy#mobile-app" className="text-blue-400 hover:text-blue-300 underline">
                      Privacy Policy
                    </Link>
                    . Pro and other in-app purchases are processed by Apple or Google; RevenueCat manages subscription status. Store platform rules and refund policies apply to those purchases in addition to these Terms.
                  </p>
                </div>
              </div>
            </div>

            {/* Support/Donations */}
            <div className="bg-purple-900/20 rounded-xl p-4 border-l-4 border-purple-600">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💝</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Support/Donations (website)
                  </h3>
                  <p className="text-gray-300">
                    Voluntary tips or payments through Ko-fi, PayPal, or Stripe on the website are not purchases of goods. They are non-refundable and don&apos;t entitle you to goods, services, or special treatment. In-app Pro subscriptions are separate—see Mobile app above.
                  </p>
                </div>
              </div>
            </div>

            {/* Digital Services */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border-l-4 border-indigo-600">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🛒</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Digital Services
                  </h3>
                  <p className="text-gray-300">
                    If you make a paid subscription, this constitutes a digital service purchase under UK law.
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="bg-gray-50 dark:bg-gray-700/20 rounded-xl p-4 border-l-4 border-gray-600">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🎮</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Content
                  </h3>
                  <p className="text-gray-300">
                    Manatap.ai is not affiliated with or endorsed by Wizards of the Coast. Magic: The Gathering and all related marks are their trademarks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-6 mb-6 text-center">
          <h2 className="text-xl font-bold mb-3">
            Questions About These Terms?
          </h2>
          <p className="text-blue-100 mb-4 text-sm">
            If you have any questions or concerns about our terms of service, please get in touch.
          </p>
          <a
            href="mailto:davy@manatap.ai"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors text-sm"
          >
            📧 Contact Us
          </a>
        </div>

        {/* Footer Links */}
        <div className="text-center">
          <div className="inline-flex gap-6 text-sm">
            <Link href="/support" className="text-gray-400 hover:text-blue-400">
              Support
            </Link>
            <Link href="/privacy" className="text-gray-400 hover:text-blue-400">
              Privacy Policy
            </Link>
            <Link href="/refund" className="text-gray-400 hover:text-blue-400">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
