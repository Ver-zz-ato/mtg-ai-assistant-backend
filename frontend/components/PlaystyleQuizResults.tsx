'use client';

import { useState, useEffect, useRef } from 'react';
import {
  costAuditClientLog,
  costAuditRequestId,
  isCostAuditClientEnabled,
} from '@/lib/observability/cost-audit';
import { useRouter } from 'next/navigation';
import { PlaystyleProfile, PlaystyleTraits, getTraitLabel, computeAvoidList, AvoidItem } from '@/lib/quiz/quiz-data';
import { CommanderSuggestion, ArchetypeSuggestion, getCommanderSuggestionsWithMatch, getArchetypeSuggestionsWithMatch } from '@/lib/quiz/commander-suggestions';
import { getImagesForNames } from '@/lib/scryfall-cache';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';
import { resolvePlaystyleDepth, getUpgradePrompt } from '@/lib/playstyle/depth';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackSignupStarted } from '@/lib/analytics-enhanced';
import { canBuildDeck, getRemainingBuilds, incrementDailyBuildCount } from '@/lib/playstyle/storage';
import DeckGenerationResultsModal, { type DeckPreviewResult } from './DeckGenerationResultsModal';

interface PlaystyleQuizResultsProps {
  profile: PlaystyleProfile;
  traits: PlaystyleTraits;
  commanders: CommanderSuggestion[];
  archetypes: ArchetypeSuggestion[];
  colorIdentities: string[];
  onClose: () => void;
  onRestart: () => void;
}

interface AIExplanation {
  paragraph: string;
  becauseBullets: string[];
}

export default function PlaystyleQuizResults({
  profile,
  traits,
  commanders,
  archetypes,
  colorIdentities,
  onClose,
  onRestart,
}: PlaystyleQuizResultsProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { modelTier, loading: proLoading } = useProStatus();
  const capture = useCapture();
  
  const [commanderImages, setCommanderImages] = useState<Map<string, string>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeckPreviewResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingImages, setLoadingImages] = useState(true);
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [expandedArchetype, setExpandedArchetype] = useState<string | null>(null);
  const [dailyBuildsUsed, setDailyBuildsUsed] = useState(0);
  const explainAttemptRef = useRef(0);

  // Resolve depth based on tier
  const depth = resolvePlaystyleDepth(modelTier);
  
  // Compute avoid list
  const avoidList = computeAvoidList(traits);
  
  // Get enhanced commanders/archetypes with match percentages
  const commandersWithMatch = getCommanderSuggestionsWithMatch(profile, traits);
  const archetypesWithMatch = getArchetypeSuggestionsWithMatch(profile, traits);

  // Fetch commander images
  useEffect(() => {
    (async () => {
      try {
        const names = commandersWithMatch.slice(0, depth.commanderCount).map(c => c.name);
        const imgMap = await getImagesForNames(names);
        const imageMap = new Map<string, string>();
        for (const commander of commandersWithMatch) {
          const normalized = commander.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
          const img = imgMap.get(normalized);
          if (img?.art_crop || img?.normal || img?.small) {
            imageMap.set(commander.name, img.art_crop || img.normal || img.small || '');
          }
        }
        setCommanderImages(imageMap);
      } catch {
        // Silently fail
      } finally {
        setLoadingImages(false);
      }
    })();
  }, [commandersWithMatch, depth.commanderCount]);

  // Fetch AI explanation for free/pro users
  useEffect(() => {
    if (!depth.showAiExplanation || depth.aiExplanationLevel === 'none') return;
    if (proLoading || authLoading) return;

    explainAttemptRef.current += 1;
    const attempt = explainAttemptRef.current;
    const session = isCostAuditClientEnabled() ? costAuditRequestId() : '';
    if (isCostAuditClientEnabled()) {
      costAuditClientLog({
        event: 'client.playstyle.explain_effect',
        component: 'PlaystyleQuizResults',
        session,
        attempt,
        level: depth.aiExplanationLevel,
        archetypeCount: archetypesWithMatch.length,
        avoidListLen: avoidList.length,
        avoidSlice: depth.avoidCount,
        profileLabelLen: (profile.label || '').length,
        proLoading,
        authLoading,
      });
    }
    
    (async () => {
      setLoadingAI(true);
      const t0 = Date.now();
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: 'client.playstyle.explain_fetch_start',
          session,
          attempt,
          level: depth.aiExplanationLevel,
        });
      }
      try {
        const res = await fetch('/api/playstyle/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            traits,
            topArchetypes: archetypesWithMatch.slice(0, 3).map(a => ({ label: a.name, matchPct: a.matchPct || 75 })),
            avoidList: avoidList.slice(0, depth.avoidCount),
            level: depth.aiExplanationLevel,
            profileLabel: profile.label,
          }),
        });
        const data = await res.json();
        if (isCostAuditClientEnabled()) {
          costAuditClientLog({
            event: 'client.playstyle.explain_fetch_done',
            session,
            attempt,
            durationMs: Date.now() - t0,
            ok: res.ok && data?.ok,
            status: res.status,
            cached: data?.cached === true,
          });
        }
        if (data.ok) {
          setAiExplanation({
            paragraph: data.paragraph,
            becauseBullets: data.becauseBullets || [],
          });
        }
      } catch {
        if (isCostAuditClientEnabled()) {
          costAuditClientLog({
            event: 'client.playstyle.explain_fetch_done',
            session,
            attempt,
            durationMs: Date.now() - t0,
            ok: false,
            err: 'exception',
          });
        }
        // Silently fail - fallback UI will show
      } finally {
        setLoadingAI(false);
      }
    })();
  }, [depth.showAiExplanation, depth.aiExplanationLevel, proLoading, authLoading, traits, archetypesWithMatch, avoidList, depth.avoidCount, profile.label]);

  // Check if user can build a deck (daily limit)
  const userCanBuild = canBuildDeck(depth.dailyDeckBuildLimit);
  const remainingBuilds = getRemainingBuilds(depth.dailyDeckBuildLimit);

  const handleBuildDeck = async () => {
    // Check daily limit for free users
    if (!userCanBuild) {
      capture('quiz_build_deck_limit_reached', {
        tier: modelTier,
      });
      return;
    }

    // Increment daily build count for limited users
    if (depth.dailyDeckBuildLimit !== undefined) {
      const newCount = incrementDailyBuildCount();
      setDailyBuildsUsed(newCount);
    }

    capture(AnalyticsEvents.QUIZ_BUILD_DECK_CLICKED, {
      profile_label: profile.label,
      tier: modelTier,
    });

    const commanderName = commandersWithMatch[0]?.name || '';
    if (!commanderName) {
      setGenerateError('No commander suggestion available');
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/deck/generate-from-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commander: commanderName,
          playstyle: profile.label,
          powerLevel: 'Casual',
          budget: 'Moderate',
          format: 'Commander',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 429 && json?.code === 'RATE_LIMIT_DAILY') {
          setGenerateError(json?.error || 'Daily limit reached');
          return;
        }
        throw new Error(json?.error || 'Generation failed');
      }
      if (json.preview && json.decklist && json.commander) {
        setPreview({
          decklist: json.decklist,
          commander: json.commander,
          colors: json.colors || [],
          overallAim: json.overallAim || `A Commander deck for ${profile.label}.`,
          title: json.title || `${commanderName} (AI)`,
          deckText: json.deckText || '',
          format: json.format || 'Commander',
          plan: json.plan || 'Optimized',
        });
      } else {
        router.push(json.url || `/my-decks/${json.deckId}`);
      }
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateDeckFromPreview = async () => {
    if (!preview) return;
    setCreating(true);
    try {
      const res = await fetch('/api/decks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: preview.title,
          format: preview.format,
          plan: preview.plan,
          colors: preview.colors,
          deck_text: preview.deckText,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to create deck');
      setPreview(null);
      onClose();
      router.push(`/my-decks/${json.id}`);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to create deck');
    } finally {
      setCreating(false);
    }
  };

  const handleShowSamples = () => {
    capture(AnalyticsEvents.QUIZ_SHOW_SAMPLES_CLICKED, {
      profile_label: profile.label,
    });
    onClose();
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

  const handleUpgrade = () => {
    capture('upgrade_cta_clicked', {
      source: 'quiz_results',
    });
    window.location.href = '/pricing';
  };

  // Trait slider component
  const TraitSlider = ({ traitKey, value }: { traitKey: keyof PlaystyleTraits; value: number }) => (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-400 w-28 truncate">{getTraitLabel(traitKey)}</span>
      <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-mono text-neutral-300 w-8 text-right">{value}%</span>
    </div>
  );

  // Locked content card component
  const LockedCard = ({ title, message, tier }: { title: string; message: string; tier: 'login' | 'upgrade' }) => (
    <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 text-center">
      <div className="text-2xl mb-2">🔒</div>
      <h4 className="font-semibold text-white mb-1">{title}</h4>
      <p className="text-sm text-neutral-400 mb-3">{message}</p>
      <button
        onClick={tier === 'login' ? handleSignup : handleUpgrade}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          tier === 'login' 
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white'
        }`}
      >
        {tier === 'login' ? 'Create free account' : 'Upgrade to Pro'}
      </button>
    </div>
  );

  return (
    <>
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {generating && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-2xl"
            aria-busy="true"
          >
            <p className="text-white font-medium mb-4">Analyzing your profile and generating deck…</p>
            <div className="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full w-1/2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                style={{ animation: 'progress-bar-slide 1.5s ease-in-out infinite' }}
              />
            </div>
          </div>
        )}
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

          {/* Trait Sliders - Visible to ALL tiers */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span>Your Trait Analysis</span>
              <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded">Computed</span>
            </h3>
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-3">
              {(Object.keys(traits) as (keyof PlaystyleTraits)[]).map((key) => (
                <TraitSlider key={key} traitKey={key} value={traits[key]} />
              ))}
            </div>
          </div>

          {/* AI Explanation Block - Tiered */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span>AI Analysis</span>
              {depth.showAiExplanation && !proLoading && (
                <span className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded">
                  {depth.aiExplanationLevel === 'full' ? 'Full' : 'Standard'}
                </span>
              )}
            </h3>
            
            {/* Show loading state while checking auth/pro status */}
            {(proLoading || authLoading) ? (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-neutral-800 rounded w-1/2" />
                  <div className="h-4 bg-neutral-800 rounded w-3/4" />
                </div>
              </div>
            ) : !depth.showAiExplanation ? (
              <LockedCard 
                title="AI Playstyle Breakdown"
                message="Sign in to get a personalized AI analysis of your playstyle."
                tier="login"
              />
            ) : loadingAI ? (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-neutral-800 rounded w-3/4" />
                  <div className="h-4 bg-neutral-800 rounded w-full" />
                  <div className="h-4 bg-neutral-800 rounded w-5/6" />
                </div>
              </div>
            ) : aiExplanation ? (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5">
                <p className="text-neutral-200 mb-4 leading-relaxed">{aiExplanation.paragraph}</p>
                {aiExplanation.becauseBullets.length > 0 && (
                  <ul className="space-y-2">
                    {aiExplanation.becauseBullets.map((bullet, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-neutral-300">
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 text-neutral-400 text-sm">
                AI analysis unavailable. Check your connection and try again.
              </div>
            )}
          </div>

          {/* What You Avoid - Tiered */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">What You Likely Avoid</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {avoidList.slice(0, depth.avoidCount).map((item, idx) => (
                <div key={idx} className="bg-neutral-900 border border-red-900/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-red-400">⚠️</span>
                    <h4 className="font-semibold text-white">{item.label}</h4>
                  </div>
                  <p className="text-sm text-neutral-400">{item.why}</p>
                </div>
              ))}
              {depth.avoidCount < 3 && avoidList.length > depth.avoidCount && (
                <div className="bg-neutral-900/50 border border-dashed border-neutral-700 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-neutral-500 text-sm mb-2">+{avoidList.length - depth.avoidCount} more</span>
                  <button
                    onClick={handleSignup}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Sign in to see all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Archetype Suggestions */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">Recommended Archetypes</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {archetypesWithMatch.map((arch, idx) => (
                <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-white">{arch.name}</h4>
                    {arch.matchPct && (
                      <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded">
                        {arch.matchPct}% match
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-400 mb-3">{arch.description}</p>
                  
                  {/* Why bullets - only for free/pro */}
                  {depth.showArchetypeWhy && arch.reasonBullets && arch.reasonBullets.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-800">
                      <button
                        onClick={() => setExpandedArchetype(expandedArchetype === arch.name ? null : arch.name)}
                        className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        <span>{expandedArchetype === arch.name ? '▼' : '▶'}</span>
                        <span>Why this fits</span>
                      </button>
                      {expandedArchetype === arch.name && (
                        <ul className="mt-2 space-y-1">
                          {arch.reasonBullets.slice(0, 2).map((bullet, bidx) => (
                            <li key={bidx} className="text-xs text-neutral-400 flex items-start gap-1">
                              <span className="text-purple-400">•</span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  
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

          {/* Commander Suggestions - Tiered Count */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span>Commander Suggestions</span>
              <span className="text-xs text-neutral-500">
                Showing {Math.min(depth.commanderCount, commandersWithMatch.length)} of {commandersWithMatch.length}
              </span>
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {commandersWithMatch.slice(0, depth.commanderCount).map((commander, idx) => {
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
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-white truncate">{commander.name}</h4>
                      {commander.matchPct && (
                        <span className="text-xs px-2 py-0.5 bg-emerald-900/50 text-emerald-300 rounded ml-2 flex-shrink-0">
                          {commander.matchPct}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mb-2">{commander.description}</p>
                    {commander.reasonBullets && commander.reasonBullets.length > 0 && (
                      <ul className="space-y-1 mb-2">
                        {commander.reasonBullets.slice(0, 2).map((bullet, bidx) => (
                          <li key={bidx} className="text-xs text-neutral-500 flex items-start gap-1">
                            <span className="text-blue-400">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <span className="text-xs px-2 py-1 bg-purple-900/30 text-purple-300 rounded">
                      {commander.archetype}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* Show more commanders prompt for lower tiers */}
            {depth.commanderCount < commandersWithMatch.length && (
              <div className="mt-4 text-center">
                <p className="text-sm text-neutral-500 mb-2">
                  +{commandersWithMatch.length - depth.commanderCount} more commanders available
                </p>
                <button
                  onClick={depth.plan === 'guest' ? handleSignup : handleUpgrade}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {depth.plan === 'guest' ? 'Sign in to see more' : 'Upgrade to Pro for all suggestions'}
                </button>
              </div>
            )}
          </div>

          {/* Pro-only Blueprint Section */}
          {depth.showBlueprint ? (
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>Deck Blueprint</span>
                <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-300 rounded">Pro</span>
              </h3>
              <div className="bg-gradient-to-br from-amber-900/10 via-orange-900/10 to-red-900/10 border border-amber-800/30 rounded-xl p-5">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-amber-300 mb-2">Early Game (T1-4)</h4>
                    <ul className="space-y-1 text-sm text-neutral-300">
                      {traits.control > 55 ? (
                        <>
                          <li>• Prioritize mana rocks and fixing</li>
                          <li>• Hold up interaction when possible</li>
                          <li>• Develop card advantage engines</li>
                        </>
                      ) : (
                        <>
                          <li>• Deploy cheap threats quickly</li>
                          <li>• Apply early pressure</li>
                          <li>• Establish board presence</li>
                        </>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-amber-300 mb-2">Mid Game (T5-8)</h4>
                    <ul className="space-y-1 text-sm text-neutral-300">
                      {traits.comboAppetite > 55 ? (
                        <>
                          <li>• Assemble combo pieces</li>
                          <li>• Protect your setup</li>
                          <li>• Look for windows to go off</li>
                        </>
                      ) : (
                        <>
                          <li>• Develop your board state</li>
                          <li>• Remove key threats</li>
                          <li>• Position for late game</li>
                        </>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-amber-300 mb-2">Win Conditions</h4>
                    <ul className="space-y-1 text-sm text-neutral-300">
                      {traits.comboAppetite > 60 ? (
                        <>
                          <li>• Infinite combos as primary wincon</li>
                          <li>• Backup through commander damage</li>
                        </>
                      ) : traits.aggression > 60 ? (
                        <>
                          <li>• Combat damage with buffs</li>
                          <li>• Token swarm overwhelm</li>
                        </>
                      ) : (
                        <>
                          <li>• Value through attrition</li>
                          <li>• Flexible finishers</li>
                        </>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-amber-300 mb-2">Interaction Package</h4>
                    <ul className="space-y-1 text-sm text-neutral-300">
                      {traits.interactionPref > 60 ? (
                        <>
                          <li>• Heavy removal suite (8-12 pieces)</li>
                          <li>• Counterspells if in blue</li>
                        </>
                      ) : (
                        <>
                          <li>• Light removal (4-6 pieces)</li>
                          <li>• Focus on protection instead</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : depth.plan === 'free' && (
            <div className="mb-6">
              <LockedCard 
                title="Deck Blueprint"
                message="Get a detailed deck-building blueprint with Pro: early/mid/late game plans, interaction packages, and more."
                tier="upgrade"
              />
            </div>
          )}

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

          {/* Action Buttons - Tiered */}
          {generateError && (
            <p className="text-sm text-red-500 mb-4">{generateError}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {depth.allowDeckBuild === 'sample' ? (
              <button
                onClick={handleShowSamples}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all transform hover:scale-105"
              >
                Show sample lists
              </button>
            ) : userCanBuild ? (
              <div className="flex-1 flex flex-col gap-2">
                <button
                  onClick={handleBuildDeck}
                  disabled={generating}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition-all transform hover:scale-105"
                >
                  {generating ? 'Generating…' : (depth.allowDeckBuild === 'limited' ? 'Build a deck' : 'Build me a deck from this')}
                </button>
                {remainingBuilds !== null && remainingBuilds < 5 && (
                  <p className="text-xs text-center text-neutral-500">
                    {remainingBuilds} deck build{remainingBuilds !== 1 ? 's' : ''} remaining today
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2">
                <button
                  disabled
                  className="w-full px-6 py-3 bg-neutral-700 text-neutral-400 font-bold rounded-lg cursor-not-allowed"
                >
                  Daily limit reached
                </button>
                <p className="text-xs text-center text-neutral-500">
                  {depth.plan === 'free' ? (
                    <button onClick={handleUpgrade} className="text-amber-400 hover:text-amber-300">
                      Upgrade to Pro for unlimited builds
                    </button>
                  ) : (
                    'Come back tomorrow for more builds'
                  )}
                </p>
              </div>
            )}
            {depth.allowDeckBuild !== 'sample' && (
              <button
                onClick={handleShowSamples}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all transform hover:scale-105"
              >
                Show sample lists
              </button>
            )}
          </div>

          {/* Signup Prompt (for guests) */}
          {!authLoading && !user && (
            <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 text-center">
              <p className="text-neutral-300 mb-3">
                Want to save this profile and unlock AI analysis? Create a free account.
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
    {preview && (
      <DeckGenerationResultsModal
        preview={preview}
        onClose={() => { setPreview(null); setGenerateError(null); }}
        onCreateDeck={handleCreateDeckFromPreview}
        isCreating={creating}
        requireAuth
        isGuest={!user}
      />
    )}
    </>
  );
}
