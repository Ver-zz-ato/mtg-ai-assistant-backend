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
  const [shouldStart, setShouldStart] = React.useState(false);
  
  // Delay tour start by 30 seconds to let user explore first
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
      setShouldStart(true);
    }, 30000); // 30 seconds
    
    return () => clearTimeout(timer);
  }, [autoStart]);
  
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

