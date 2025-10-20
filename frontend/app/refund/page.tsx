import React from 'react';
import Link from 'next/link';

// Cache for 1 hour (static policy content)
export const revalidate = 3600;

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">
            Refund & Cancellation Policy
          </h1>
          <p className="text-gray-400">
            Effective date: October 2025
          </p>
        </div>

        {/* Intro */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 mb-6">
          <p className="text-base text-gray-300">
            ManaTap.ai offers both free and paid features. Paid features ("Pro") are billed through Stripe, our secure payment processor.
          </p>
        </div>

        {/* Subscriptions Section */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">🔄</div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Subscriptions
              </h2>
            </div>
          </div>
          
          <p className="text-gray-300 mb-3 text-sm">
            Pro subscriptions are billed either <strong>monthly</strong> or <strong>yearly</strong>.
          </p>
          
          <div className="bg-blue-900/20 rounded-lg p-4 border-l-4 border-blue-600">
            <h3 className="font-bold text-white mb-1.5 text-base">
              Easy Cancellation
            </h3>
            <p className="text-gray-300 text-sm">
              You can cancel at any time from your Stripe billing portal — a link is provided in your confirmation email and within your account settings. When you cancel, access continues until the end of your current billing period.
            </p>
          </div>
        </div>

        {/* Refunds Section */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">💰</div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Refunds
              </h2>
            </div>
          </div>
          
          <p className="text-gray-300 mb-4 text-sm">
            We want you to be happy with the service.
          </p>

          {/* 14-Day Window */}
          <div className="bg-emerald-900/20 rounded-lg p-4 border-l-4 border-emerald-600 mb-3">
            <h3 className="font-bold text-white mb-1.5 text-base">
              ✅ 14-Day Money-Back Guarantee
            </h3>
            <p className="text-gray-300 text-sm">
              If you are a new Pro subscriber, you may request a refund within <strong>14 days</strong> of your first payment, provided the service has not been substantially used.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-gray-300 text-sm">
              Refunds are issued to the original payment method.
            </p>
            
            <div className="bg-gray-700/20 rounded-lg p-3">
              <p className="text-gray-300 text-sm">
                <strong>To request a refund:</strong> Contact{' '}
                <a href="mailto:support@manatap.ai" className="text-blue-400 hover:underline">
                  support@manatap.ai
                </a>{' '}
                with your Stripe receipt or account email.
              </p>
            </div>

            <p className="text-sm text-gray-400 italic">
              Note: Donations or voluntary tips (through Ko-fi or PayPal) are non-refundable.
            </p>
          </div>
        </div>

        {/* Payment Issues */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">⚠️</div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Failed or Disputed Payments
              </h2>
            </div>
          </div>
          
          <p className="text-gray-300 mb-3 text-sm">
            If a payment fails or is disputed, we may temporarily suspend Pro access until the issue is resolved.
          </p>
          
          <div className="bg-purple-900/20 rounded-lg p-4 border-l-4 border-purple-600">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">🔒</span>
              <h3 className="font-bold text-white text-base">
                Secure Payments
              </h3>
            </div>
            <p className="text-gray-300 text-sm">
              Stripe handles all card data securely; ManaTap never stores payment information.
            </p>
          </div>
        </div>

        {/* Legal */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">⚖️</div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Legal
              </h2>
            </div>
          </div>
          
          <ul className="space-y-2 text-gray-300 text-sm">
            <li className="flex items-start gap-3">
              <span className="text-blue-400 mt-1">•</span>
              <span>All prices include any applicable UK taxes.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-400 mt-1">•</span>
              <span>This policy is governed by the laws of England and Wales.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-400 mt-1">•</span>
              <span>
                For more information about Stripe's refund process, visit:{' '}
                <a 
                  href="https://support.stripe.com/topics/refunds?locale=en-GB" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-blue-400 hover:underline break-all"
                >
                  stripe.com/refunds
                </a>
              </span>
            </li>
          </ul>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl p-6 mb-6 text-center">
          <h2 className="text-xl font-bold mb-3">
            Need Help With a Refund?
          </h2>
          <p className="text-blue-100 mb-4 text-sm">
            Our team is here to help. Contact us and we'll get back to you within 2 business days.
          </p>
          <a
            href="mailto:support@manatap.ai"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors text-sm"
          >
            📧 Contact Support
          </a>
        </div>

        {/* Footer Links */}
        <div className="text-center">
          <div className="inline-flex gap-6 text-sm">
            <Link href="/support" className="text-gray-400 hover:text-blue-400">
              Support
            </Link>
            <Link href="/terms" className="text-gray-400 hover:text-blue-400">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-gray-400 hover:text-blue-400">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
