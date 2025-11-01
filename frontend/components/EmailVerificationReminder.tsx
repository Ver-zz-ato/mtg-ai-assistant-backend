'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { capture } from '@/lib/ph';

export default function EmailVerificationReminder() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const checkVerification = async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      // Check if email is verified
      const emailVerified = user.email_confirmed_at !== null;
      
      if (!emailVerified) {
        setEmail(user.email || '');
        
        // Check if we should show the reminder (24 hours after signup)
        const signupTime = new Date(user.created_at || Date.now()).getTime();
        const now = Date.now();
        const hoursSinceSignup = (now - signupTime) / (1000 * 60 * 60);

        // Show if more than 1 hour since signup (24 hours in production)
        const showAfterHours = process.env.NODE_ENV === 'development' ? 0.1 : 24;
        
        if (hoursSinceSignup > showAfterHours) {
          // Check if already dismissed today
          const dismissed = localStorage.getItem('email_verification_dismissed');
          if (dismissed) {
            const dismissedDate = new Date(dismissed);
            const hoursSinceDismissed = (now - dismissedDate.getTime()) / (1000 * 60 * 60);
            if (hoursSinceDismissed < 24) {
              return; // Don't show if dismissed within last 24 hours
            }
          }
          
          setShow(true);
          capture('email_verification_reminder_shown', { hours_since_signup: hoursSinceSignup });
        }
      }
    };

    checkVerification();
  }, []);

  const handleResend = async () => {
    setResending(true);
    const supabase = createBrowserSupabaseClient();

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) throw error;

      const { toast } = await import('@/lib/toast-client');
      toast('✅ Verification email sent! Check your inbox.', 'success');
      capture('email_verification_resent', { email });
      
      // Auto-dismiss after successful resend
      setTimeout(() => setShow(false), 2000);
    } catch (error: any) {
      const { toast } = await import('@/lib/toast-client');
      toast(`❌ ${error.message}`, 'error');
      capture('email_verification_resend_failed', { error: error.message });
    } finally {
      setResending(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('email_verification_dismissed', new Date().toISOString());
    capture('email_verification_reminder_dismissed');
  };

  if (!show) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[999] max-w-md w-full mx-4 animate-slide-down">
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl shadow-2xl p-4 border border-amber-400/30">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-2xl">
            ✉️
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg mb-1">Verify Your Email</h3>
            <p className="text-sm text-white/90 mb-3">
              Verify your email to unlock full access and earn the <strong>Early Adopter</strong> badge!
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResend}
                disabled={resending}
                className="bg-white text-amber-600 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                {resending ? 'Sending...' : 'Resend Email'}
              </button>
              <button
                onClick={handleDismiss}
                className="text-white/90 hover:text-white text-sm underline"
              >
                Remind me later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-white/80 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

















































