'use client';

import { useState, useEffect } from 'react';
import { aiMemory } from '@/lib/ai-memory';
import { capture } from '@/lib/ph';

interface AIMemoryGreetingProps {
  className?: string;
  onDismiss?: () => void;
  showConsentPrompt?: boolean;
}

export default function AIMemoryGreeting({ 
  className = '', 
  onDismiss,
  showConsentPrompt = true 
}: AIMemoryGreetingProps) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    // Check consent
    const consentStatus = localStorage.getItem('ai_memory_consent');
    const consented = consentStatus === 'true';
    setHasConsented(consented);

    if (consented) {
      const personalizedGreeting = aiMemory.getPersonalizedGreeting();
      if (personalizedGreeting) {
        setGreeting(personalizedGreeting);
        setIsVisible(true);
        
        // Track memory engagement
        try {
          capture('ai_memory_greeting_shown', {
            has_context: aiMemory.hasContext(),
            greeting_type: personalizedGreeting.includes('deck') ? 'deck' : 
                         personalizedGreeting.includes('collection') ? 'collection' : 'general'
          });
        } catch {}
      }
    } else if (showConsentPrompt && aiMemory.hasContext()) {
      // User has context but hasn't consented yet
      setShowConsent(true);
    }
  }, [showConsentPrompt]);

  const handleConsent = (consented: boolean) => {
    localStorage.setItem('ai_memory_consent', consented.toString());
    setHasConsented(consented);
    setShowConsent(false);

    // Track consent decision
    try {
      capture('ai_memory_consent', {
        consented,
        has_context: aiMemory.hasContext()
      });
    } catch {}

    if (consented) {
      const personalizedGreeting = aiMemory.getPersonalizedGreeting();
      if (personalizedGreeting) {
        setGreeting(personalizedGreeting);
        setIsVisible(true);
      }
    } else {
      // Clear context if user declined
      aiMemory.clearContext();
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      onDismiss();
    }

    // Track dismissal
    try {
      capture('ai_memory_greeting_dismissed');
    } catch {}
  };

  const handleClearMemory = () => {
    aiMemory.clearContext();
    localStorage.setItem('ai_memory_consent', 'false');
    setHasConsented(false);
    setIsVisible(false);
    setGreeting(null);

    // Track memory clearing
    try {
      capture('ai_memory_cleared', {
        reason: 'user_request_greeting'
      });
    } catch {}
  };

  // Consent prompt
  if (showConsent) {
    return (
      <div className={`bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-purple-600 text-sm">🤖</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">
              Personalized AI Experience
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              I can remember your recent decks and collections to provide more personalized assistance. 
              This information is stored locally on your device and helps me give you better recommendations.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleConsent(true)}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
              >
                Enable Memory
              </button>
              <button
                onClick={() => handleConsent(false)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                No Thanks
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Personalized greeting
  if (isVisible && greeting && hasConsented) {
    return (
      <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 text-sm">🎯</span>
          </div>
          <div className="flex-1">
            <p className="text-gray-800 leading-relaxed">
              {greeting}
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
              <span>AI remembers your recent activity</span>
              <button
                onClick={handleClearMemory}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Clear memory
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}