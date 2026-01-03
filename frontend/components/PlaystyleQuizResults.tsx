'use client';

import { useState, useEffect } from 'react';
import { PlaystyleProfile } from '@/lib/quiz/quiz-data';
import { CommanderSuggestion, ArchetypeSuggestion } from '@/lib/quiz/commander-suggestions';
import { getImagesForNames } from '@/lib/scryfall-cache';
import { useAuth } from '@/lib/auth-context';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackSignupStarted } from '@/lib/analytics-enhanced';

interface PlaystyleQuizResultsProps {
  profile: PlaystyleProfile;
  commanders: CommanderSuggestion[];
  archetypes: ArchetypeSuggestion[];
  colorIdentities: string[];
  onClose: () => void;
  onRestart: () => void;
}

export default function PlaystyleQuizResults({
  profile,
  commanders,
  archetypes,
  colorIdentities,
  onClose,
  onRestart,
}: PlaystyleQuizResultsProps) {
  const { user, loading } = useAuth();
  const capture = useCapture();
  const [commanderImages, setCommanderImages] = useState<Map<string, string>>(new Map());
  const [loadingImages, setLoadingImages] = useState(true);

  useEffect(() => {
    // Fetch commander images
    (async () => {
      try {
        const names = commanders.map(c => c.name);
        const imgMap = await getImagesForNames(names);
        const imageMap = new Map<string, string>();
        for (const commander of commanders) {
          const normalized = commander.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
          const img = imgMap.get(normalized);
          if (img?.art_crop || img?.normal || img?.small) {
            imageMap.set(commander.name, img.art_crop || img.normal || img.small || '');
          }
        }
        setCommanderImages(imageMap);
      } catch (e) {
        console.error('Failed to load commander images:', e);
      } finally {
        setLoadingImages(false);
      }
    })();
  }, [commanders]);

  const handleBuildDeck = () => {
    capture(AnalyticsEvents.QUIZ_BUILD_DECK_CLICKED, {
      profile_label: profile.label,
    });

    // Store quiz context for chat
    const quizContext = {
      profile: profile.label,
      gameLength: profile.gameLength,
      chaosTolerance: profile.chaosTolerance,
      winVsStory: profile.winVsStory,
      interactionPreference: profile.interactionPreference,
      commanders: commanders.slice(0, 3).map(c => c.name),
      archetypes: archetypes.slice(0, 2).map(a => a.name),
    };

    try {
      localStorage.setItem('playstyle_quiz_context', JSON.stringify(quizContext));
    } catch {}

    // Pre-fill chat with context
    const chatMessage = `Based on my playstyle quiz results, build me a ${archetypes[0]?.name || 'commander'} deck. My profile: ${profile.label} (${profile.gameLength} games, ${profile.chaosTolerance} chaos tolerance, ${profile.winVsStory}). Suggested commanders: ${commanders.slice(0, 3).map(c => c.name).join(', ')}.`;

    // Dispatch event to set chat input
    window.dispatchEvent(new CustomEvent('quiz-build-deck', {
      detail: { message: chatMessage }
    }));

    // Close modal and scroll to chat
    onClose();
    setTimeout(() => {
      const chatInput = document.querySelector('textarea[placeholder*="deck"], textarea[placeholder*="Analyze"]') as HTMLTextAreaElement;
      if (chatInput) {
        chatInput.focus();
        chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleShowSamples = () => {
    capture(AnalyticsEvents.QUIZ_SHOW_SAMPLES_CLICKED, {
      profile_label: profile.label,
    });
    onClose();
    // Dispatch event to open sample deck modal
    window.dispatchEvent(new CustomEvent('open-sample-deck-modal'));
  };

  const handleSignup = () => {
    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
      source: 'quiz_results',
    });
    trackSignupStarted('email', 'quiz_results');
    window.dispatchEvent(new CustomEvent('open-auth-modal', {
      detail: { mode: 'signup' }
    }));
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Your MTG Profile</h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Profile Card */}
          <div className="bg-gradient-to-br from-blue-900/30 via-purple-900/20 to-pink-900/30 rounded-xl border border-blue-800/30 p-6 mb-6">
            <div className="text-center mb-4">
              <h3 className="text-3xl font-bold text-white mb-2">{profile.label}</h3>
              <p className="text-neutral-300">{profile.description}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-neutral-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-neutral-400 mb-1">Game Length</div>
                <div className="text-sm font-semibold text-white">{profile.gameLength}</div>
              </div>
              <div className="bg-neutral-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-neutral-400 mb-1">Chaos Tolerance</div>
                <div className="text-sm font-semibold text-white">{profile.chaosTolerance}</div>
              </div>
              <div className="bg-neutral-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-neutral-400 mb-1">Win vs Story</div>
                <div className="text-sm font-semibold text-white">{profile.winVsStory}</div>
              </div>
              <div className="bg-neutral-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-neutral-400 mb-1">Interaction</div>
                <div className="text-sm font-semibold text-white">{profile.interactionPreference}</div>
              </div>
            </div>
          </div>

          {/* Archetype Suggestions */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">Recommended Archetypes</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {archetypes.map((arch, idx) => (
                <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <h4 className="font-semibold text-white mb-2">{arch.name}</h4>
                  <p className="text-sm text-neutral-400">{arch.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {arch.colorIdentities.slice(0, 3).map((ci, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-neutral-800 rounded text-neutral-300">
                        {ci}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commander Suggestions */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">Commander Suggestions</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {commanders.slice(0, 6).map((commander, idx) => {
                const imageUrl = commanderImages.get(commander.name);
                return (
                  <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                    {loadingImages ? (
                      <div className="w-full h-32 bg-neutral-800 rounded-lg mb-3 animate-pulse" />
                    ) : imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={commander.name}
                        className="w-full h-32 object-cover rounded-lg mb-3"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-32 bg-neutral-800 rounded-lg mb-3 flex items-center justify-center text-neutral-500 text-xs">
                        No image
                      </div>
                    )}
                    <h4 className="font-semibold text-white mb-1">{commander.name}</h4>
                    <p className="text-xs text-neutral-400 mb-2">{commander.description}</p>
                    <span className="text-xs px-2 py-1 bg-purple-900/30 text-purple-300 rounded">
                      {commander.archetype}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Color Identities */}
          {colorIdentities.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-4">Suggested Color Identities</h3>
              <div className="flex flex-wrap gap-2">
                {colorIdentities.map((ci, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold text-white"
                  >
                    {ci}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <button
              onClick={handleBuildDeck}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-lg transition-all transform hover:scale-105"
            >
              Build me a deck from this
            </button>
            <button
              onClick={handleShowSamples}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all transform hover:scale-105"
            >
              Show sample lists
            </button>
          </div>

          {/* Signup Prompt (for guests) */}
          {!loading && !user && (
            <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 text-center">
              <p className="text-neutral-300 mb-3">
                Want to save this profile and your future builds? Create a free account.
              </p>
              <button
                onClick={handleSignup}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
              >
                Sign Up Free
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-center pt-4 border-t border-neutral-800">
            <button
              onClick={onRestart}
              className="px-4 py-2 rounded-lg font-medium bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-all"
            >
              Retake Quiz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
