"use client";

import React from 'react';
import OnboardingTour, { TourStep } from './OnboardingTour';

export interface MainFeaturesTourProps {
  autoStart?: boolean;
}

/**
 * MainFeaturesTour - The main onboarding tour for ManaTap
 * 
 * Guides users through 7 key features:
 * 1. Cost-to-Finish
 * 2. Budget Swaps
 * 3. Price Tracker
 * 4. Mulligan Simulator
 * 5. Probability Calculator
 * 6. Custom Card Creator
 * 7. AI Chat Assistant (Final)
 */
export default function MainFeaturesTour({ autoStart = true }: MainFeaturesTourProps) {
  const [showWelcome, setShowWelcome] = React.useState(false);
  const [shouldStart, setShouldStart] = React.useState(false);
  
  // Show welcome modal after 30 seconds to let user explore first
  // But NEVER show on mobile phones
  React.useEffect(() => {
    if (!autoStart) return;
    
    // Check if mobile phone (not tablet)
    const isMobilePhone = /iPhone|Android|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent) 
      && window.innerWidth < 768;
    
    if (isMobilePhone) {
      console.log('Tour disabled on mobile phone');
      return;
    }
    
    const timer = setTimeout(() => {
      setShowWelcome(true);
    }, 30000); // 30 seconds
    
    return () => clearTimeout(timer);
  }, [autoStart]);

  const handleStartTour = () => {
    setShowWelcome(false);
    setShouldStart(true);
  };

  const handleSkipTour = () => {
    setShowWelcome(false);
    // Mark as seen so it doesn't show again
    if (typeof window !== 'undefined') {
      localStorage.setItem('tour-main-features-v2-skipped', 'true');
    }
  };
  
  const steps: TourStep[] = [
    {
      id: 'cost-to-finish',
      title: '💰 Cost to Finish',
      description: 'See exactly which cards you need to complete your deck and how much they\'ll cost. Compare against your collection to identify gaps and plan your purchases.',
      target: '[data-tour="cost-to-finish"]',
      placement: 'bottom',
    },
    {
      id: 'budget-swaps',
      title: '💸 Budget Swaps',
      description: 'Get AI-powered suggestions for cheaper alternatives to expensive cards. Maintain your deck\'s power level while saving money on key pieces.',
      target: '[data-tour="budget-swaps"]',
      placement: 'bottom',
    },
    {
      id: 'price-tracker',
      title: '📈 Price Tracker',
      description: 'Track card prices over time and catch market spikes before they happen. Monitor your collection\'s value and identify the best time to buy or trade.',
      target: '[data-tour="price-tracker"]',
      placement: 'bottom',
    },
    {
      id: 'mulligan',
      title: '🔄 Mulligan Simulator',
      description: 'Practice your opening hands and test mulligan decisions. See what you\'re likely to draw in the first few turns and optimize your deck\'s consistency.',
      target: '[data-tour="mulligan"]',
      placement: 'bottom',
    },
    {
      id: 'probability',
      title: '🎲 Probability Calculator',
      description: 'Calculate the odds of drawing specific cards by any turn. Perfect for tuning your mana base and ensuring you hit your combo pieces when you need them.',
      target: '[data-tour="probability"]',
      placement: 'bottom',
    },
    {
      id: 'custom-card',
      title: '🎨 Custom Card Creator',
      description: 'Design your own Magic cards with authentic MTG frames and formatting. Perfect for proxies, tokens, or just creative fun. Share your creations with the community!',
      target: '[data-tour="custom-card"]',
      placement: 'left',
    },
    {
      id: 'chat',
      title: '💬 AI Deck Assistant',
      description: 'Chat with our AI to analyze your deck, get card suggestions, and answer any Magic rules questions. Your personal deck-building expert, available 24/7. This is your command center for all things Magic!',
      target: '[data-tour="chat"]',
      placement: 'left',
    },
  ];

  return (
    <>
      {/* Welcome Modal */}
      {showWelcome && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-purple-500/30 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">👋</div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent mb-2">
                Welcome to ManaTap AI!
              </h2>
              <p className="text-gray-300 text-lg">
                Your intelligent Magic: The Gathering deck building assistant
              </p>
            </div>

            {/* Content */}
            <div className="space-y-4 mb-8 text-gray-300">
              <p>
                We've built powerful tools to help you build better decks, save money, and make smarter decisions:
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">💰</span>
                  <span><strong>Cost-to-Finish</strong> - See what you need and how much it costs</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">💸</span>
                  <span><strong>Budget Swaps</strong> - Get AI-powered cheaper alternatives</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-1">📈</span>
                  <span><strong>Price Tracker</strong> - Monitor card prices over time</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-1">🎲</span>
                  <span><strong>Probability Tools</strong> - Calculate your odds and test mulligans</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-400 mt-1">💬</span>
                  <span><strong>AI Chat Assistant</strong> - Your 24/7 deck-building expert</span>
                </li>
              </ul>
              <p className="text-sm text-gray-400 italic mt-4">
                Want a quick tour to see where everything is?
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSkipTour}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Skip Tour
              </button>
              <button
                onClick={handleStartTour}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-purple-500/50"
              >
                Start Tour 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actual Tour */}
      <OnboardingTour
        tourId="main-features-v2"
        steps={steps}
        autoStart={shouldStart}
        onComplete={() => {
          console.log('✅ Main features tour completed!');
        }}
        onSkip={() => {
          console.log('⏭️ Tour skipped');
        }}
      />
    </>
  );
}

/**
 * Lightweight tour for deck list page (when user has no specific deck)
 */
export function DeckListTour() {
  const steps: TourStep[] = [
    {
      id: 'welcome',
      title: '👋 Welcome to ManaTap!',
      description: 'Build better Magic decks with AI-powered analysis, budget optimization, and powerful calculators.',
      placement: 'center',
    },
    {
      id: 'create-deck',
      title: '🎴 Create Your First Deck',
      description: 'Import a deck from text, start from a sample Commander deck, or build from scratch. ManaTap supports all formats!',
      target: '[data-tour="create-deck"]',
      placement: 'bottom',
    },
    {
      id: 'tools-preview',
      title: '🛠️ Powerful Tools Await',
      description: 'Once you have a deck, unlock Cost-to-Finish analysis, Mulligan simulator, Probability calculator, and Budget swap suggestions.',
      placement: 'center',
    },
  ];

  return (
    <OnboardingTour
      tourId="deck-list-intro-v1"
      steps={steps}
      autoStart={true}
    />
  );
}

