'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { capture } from '@/lib/ph';

export default function GuestExitWarning() {
  const [showModal, setShowModal] = useState(false);
  const [hasGuestChat, setHasGuestChat] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const pathname = usePathname();

  // Check if guest has active chat on mount and when localStorage changes
  // Trigger earlier: after 2+ messages (instead of just any messages)
  useEffect(() => {
    const checkGuestChat = async () => {
      try {
        const guestMessages = localStorage.getItem('guest_chat_messages');
        
        // Properly check if user is logged in using Supabase
        const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        const isGuest = !session?.user;
        
        const messages = guestMessages ? JSON.parse(guestMessages) : [];
        // Trigger after 2+ messages (earlier than before)
        setHasGuestChat(isGuest && messages.length >= 2);
      } catch {
        setHasGuestChat(false);
      }
    };

    checkGuestChat();
    
    // Listen for storage changes
    window.addEventListener('storage', checkGuestChat);
    
    // Custom event when guest sends message
    const handleGuestMessage = () => checkGuestChat();
    window.addEventListener('guest-message-sent', handleGuestMessage);

    return () => {
      window.removeEventListener('storage', checkGuestChat);
      window.removeEventListener('guest-message-sent', handleGuestMessage);
    };
  }, []);

  // Intercept navigation attempts
  useEffect(() => {
    if (!hasGuestChat) return;

    // Check session flag to see if user dismissed warning
    const dismissed = sessionStorage.getItem('guest_exit_warning_dismissed');
    if (dismissed) return;

    // Handle browser back/forward/close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have an unsaved chat. Sign up to save it before leaving!';
      capture('guest_exit_warning_triggered', { trigger: 'beforeunload' });
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Intercept link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;
      
      if (link && link.href && !link.href.startsWith('#')) {
        const linkPathname = new URL(link.href, window.location.origin).pathname;
        
        // Don't warn if staying on homepage or going to auth
        if (linkPathname === '/' || linkPathname === pathname || 
            linkPathname.includes('/auth') || linkPathname.includes('/login') || linkPathname.includes('/signup')) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        
        capture('guest_exit_warning_triggered', { trigger: 'link_click', to: linkPathname });
        
        setPendingNavigation(() => () => {
          window.location.href = link.href;
        });
        setShowModal(true);
      }
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClick, true);
    };
  }, [hasGuestChat, pathname]);

  const handleStayAndSignUp = () => {
    capture('guest_exit_warning_signup_clicked');
    setShowModal(false);
    setPendingNavigation(null);
    // Trigger auth modal
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'signup' } }));
  };

  const handleLeaveAnyway = () => {
    capture('guest_exit_warning_left_anyway');
    setShowModal(false);
    if (pendingNavigation) {
      // Clear guest chat from localStorage
      try {
        localStorage.removeItem('guest_chat_messages');
      } catch {}
      pendingNavigation();
    }
  };

  const handleDontShowAgain = () => {
    capture('guest_exit_warning_dismissed_session');
    sessionStorage.setItem('guest_exit_warning_dismissed', 'true');
    setShowModal(false);
    if (pendingNavigation) {
      pendingNavigation();
    }
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10001] p-4" onClick={(e) => {
      if (e.target === e.currentTarget) {
        setShowModal(false);
        setPendingNavigation(null);
      }
    }}>
      <div className="bg-neutral-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-amber-500/30">
        {/* Warning icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber-600/20 border-2 border-amber-600/40 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-white text-center mb-2">
          Save Your Chat History Before You Go!
        </h2>
        
        <p className="text-gray-300 text-center mb-6">
          Your conversation isn't saved. Sign up for free (30 seconds) to save your chat history, build decks, and track collections - all forever!
        </p>

        <div className="space-y-3">
          <button
            onClick={handleStayAndSignUp}
            className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            💾 Sign Up Free & Save My Chat
          </button>
          
          <button
            onClick={handleLeaveAnyway}
            className="w-full bg-neutral-700 hover:bg-neutral-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            Leave Anyway
          </button>
          
          <button
            onClick={handleDontShowAgain}
            className="w-full text-gray-400 hover:text-gray-300 text-sm py-2 transition-colors"
          >
            Don't show this again (this session)
          </button>
        </div>
      </div>
    </div>
  );
}







