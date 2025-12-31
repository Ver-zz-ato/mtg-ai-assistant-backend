'use client';

import { useAuth } from '@/lib/auth-context';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackSignupStarted } from '@/lib/analytics-enhanced';

interface PostAnalysisSignupPromptProps {
  messages: Array<{ role: string; content: string }>;
}

export default function PostAnalysisSignupPrompt({ messages }: PostAnalysisSignupPromptProps) {
  const { user, loading } = useAuth();
  const capture = useCapture();

  // Only show for guest users
  if (loading || user) {
    return null;
  }

  // Check if last assistant message contains analysis-like content
  const lastAssistantMessage = messages
    .filter(m => m.role === 'assistant')
    .pop();
  
  if (!lastAssistantMessage) {
    return null;
  }

  const analysisKeywords = [
    'archetype',
    'mana curve',
    'game plan',
    'recommendations',
    'synergy',
    'problems',
    'strengths',
    'weaknesses',
    'score',
    'analysis'
  ];

  const hasAnalysis = analysisKeywords.some(keyword => 
    lastAssistantMessage.content.toLowerCase().includes(keyword)
  );

  if (!hasAnalysis) {
    return null;
  }

  const handleSignupClick = () => {
    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
      source: 'post_analysis_prompt',
      position: 'inline_after_analysis'
    });
    trackSignupStarted('email', 'post_analysis_prompt');
    
    // Trigger signup modal via custom event
    window.dispatchEvent(new CustomEvent('open-auth-modal', { 
      detail: { mode: 'signup' } 
    }));
  };

  return (
    <div className="mt-4 mb-2 px-4 py-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-white font-semibold text-sm mb-1">
            Save this analysis to your account
          </p>
          <p className="text-blue-200 text-xs">
            Free signup takes 30 seconds • No credit card required
          </p>
        </div>
        <button
          onClick={handleSignupClick}
          className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap"
        >
          Sign Up Free
        </button>
      </div>
    </div>
  );
}
