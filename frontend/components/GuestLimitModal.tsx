'use client';

import React, { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface GuestLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageCount: number;
}

export default function GuestLimitModal({ isOpen, onClose, messageCount }: GuestLimitModalProps) {
  const [isSigningUp, setIsSigningUp] = useState(false);

  useEffect(() => {
    if (isOpen) {
      capture('guest_limit_modal_shown', { message_count: messageCount });
    }
  }, [isOpen, messageCount]);

  if (!isOpen) return null;

  const handleSignUp = () => {
    setIsSigningUp(true);
    capture('guest_limit_signup_clicked', { message_count: messageCount });
    // Trigger auth modal
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'signup' } }));
    onClose();
  };

  const handleSignIn = () => {
    capture('guest_limit_signin_clicked', { message_count: messageCount });
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'signin' } }));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4" onClick={onClose}>
      <div 
        className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-emerald-500/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-600 to-blue-600 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-white mb-3">
          You've Reached the Guest Limit
        </h2>

        {/* Message count */}
        <div className="text-center mb-6">
          <div className="inline-block px-4 py-2 bg-emerald-600/20 border border-emerald-600/30 rounded-lg">
            <span className="text-emerald-400 font-semibold">{messageCount}/20 messages used</span>
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-6 space-y-3">
          <p className="text-center text-gray-300 mb-4">
            Sign up for free to continue chatting and unlock:
          </p>
          <div className="space-y-2">
            {[
              '💬 Unlimited AI chat messages',
              '💾 Save your chat history forever',
              '📚 Build & manage unlimited decks',
              '💰 Track card prices & collections',
              '🎯 Get personalized deck recommendations'
            ].map((benefit, i) => (
              <div key={i} className="flex items-center gap-3 text-gray-200">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <button
            onClick={handleSignUp}
            disabled={isSigningUp}
            className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningUp ? 'Opening...' : 'Create Free Account'}
          </button>
          <button
            onClick={handleSignIn}
            className="w-full bg-neutral-700 hover:bg-neutral-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Already have an account? Sign In
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}











































