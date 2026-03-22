import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete Account - ManaTap',
  description: 'Learn how to delete your ManaTap account and associated data.',
};

const SUPPORT_EMAIL = 'support@manatap.ai';

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">
            Delete Your ManaTap Account
          </h1>
          <p className="text-gray-400">
            Request deletion of your account and associated data.
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-700 space-y-6">
          {/* Intro */}
          <p className="text-gray-300">
            You can request deletion of your ManaTap account and all associated data at any time. 
            Once processed, your account and data will be permanently removed.
          </p>

          {/* How to request deletion */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              How to request deletion
            </h2>
            <div className="space-y-3 text-gray-300">
              <div>
                <span className="font-medium text-gray-200">In-app:</span>{' '}
                Go to <Link href="/profile" className="text-blue-400 hover:text-blue-300 underline">Profile</Link> → Security → Delete Account
              </div>
              <div>
                <span className="font-medium text-gray-200">By email:</span>{' '}
                Send a request to{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>

          {/* What data is deleted */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              What data is deleted
            </h2>
            <ul className="space-y-2 text-gray-300 list-disc list-inside">
              <li>Account information (email, user ID)</li>
              <li>Decks and collections</li>
              <li>Saved preferences</li>
              <li>AI chat history</li>
            </ul>
          </div>

          {/* Retention */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Retention
            </h2>
            <ul className="space-y-2 text-gray-300 list-disc list-inside">
              <li>Deletion requests are processed within 7 days.</li>
              <li>Some data may be retained temporarily for legal or security purposes.</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Contact
            </h2>
            <p className="text-gray-300">
              Questions about account deletion? Contact us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="text-center mt-8">
          <div className="inline-flex gap-6 text-sm">
            <Link href="/" className="text-gray-400 hover:text-blue-400">
              Home
            </Link>
            <Link href="/support" className="text-gray-400 hover:text-blue-400">
              Support
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
