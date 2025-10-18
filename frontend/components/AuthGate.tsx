'use client';

import { useState } from 'react';

interface AuthGateProps {
  message?: string;
  onSignIn?: () => void;
}

export default function AuthGate({ 
  message = "Sign in to use this feature",
  onSignIn 
}: AuthGateProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleSignIn = () => {
    if (onSignIn) {
      onSignIn();
    } else {
      // Scroll to top and focus on sign-in form in header
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Optionally trigger sign-up modal
      const signUpBtn = document.querySelector('[data-signup-trigger]');
      if (signUpBtn instanceof HTMLElement) {
        signUpBtn.click();
      }
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-2xl p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔐</div>
          <div className="flex-1">
            <p className="text-sm font-medium mb-2">{message}</p>
            <div className="flex gap-2">
              <button
                onClick={handleSignIn}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="px-4 py-2 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="text-white/80 hover:text-white text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper hook to show auth gate
export function useAuthGate() {
  const [showGate, setShowGate] = useState(false);
  
  const requireAuth = (user: any, message?: string) => {
    if (!user) {
      setShowGate(true);
      return false;
    }
    return true;
  };

  const AuthGateComponent = showGate ? (
    <AuthGate onSignIn={() => setShowGate(false)} />
  ) : null;

  return { requireAuth, AuthGateComponent };
}

