'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { capture } from '@/lib/ph';

export default function EmailVerificationSuccessPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const checkVerificationSuccess = async () => {
      try {
        // Check URL hash for access_token (Supabase email confirmation redirect)
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1)); // Remove # and parse
        const accessToken = params.get('access_token');
        const type = params.get('type');
        
        // Also check query params as fallback
        const queryParams = new URLSearchParams(window.location.search);
        const queryType = queryParams.get('type');
        
        if ((accessToken && type === 'signup') || queryType === 'email_verified') {
          // User just verified their email
          const supabase = createBrowserSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user && user.email_confirmed_at) {
            // Show success popup
            setShow(true);
            capture('email_verified_success', { user_id: user.id });
            
            // Auto-dismiss after 5 seconds
            setTimeout(() => setShow(false), 5000);
            
            // Clean up URL
            if (hash) {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }
        }
      } catch (e) {
        console.error('[EmailVerificationSuccessPopup] Error:', e);
      }
    };

    // Run after a short delay to ensure auth is initialized
    const timer = setTimeout(checkVerificationSuccess, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setShow(false);
    capture('email_verification_popup_dismissed');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="max-w-md w-full rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-950 via-neutral-900 to-neutral-950 p-6 shadow-2xl shadow-emerald-500/20 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success icon */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center mb-2 bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
          Email Verified!
        </h2>

        {/* Message */}
        <p className="text-center text-neutral-300 mb-4">
          🎉 Your email has been successfully verified.<br />
          <span className="text-amber-400 font-semibold">You've earned the Early Adopter badge!</span>
        </p>

        {/* Badge preview */}
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-3 mb-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center text-2xl">
            🌟
          </div>
          <div className="flex-1">
            <div className="font-bold text-amber-400">Early Adopter</div>
            <div className="text-xs text-neutral-400">Unlocked by verifying your email</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors"
          >
            Close
          </button>
          <a
            href="/profile"
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-semibold text-center transition-all shadow-lg hover:shadow-xl"
          >
            View Profile
          </a>
        </div>
      </div>
    </div>
  );
}

