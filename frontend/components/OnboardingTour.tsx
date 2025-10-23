"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { capture } from '@/lib/ph';
import {
  trackOnboardingStarted,
  trackOnboardingStep,
  trackOnboardingCompleted,
  trackOnboardingSkipped,
} from '@/lib/analytics-onboarding';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for element to highlight
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface OnboardingTourProps {
  tourId: string; // Unique ID for this tour (for localStorage)
  steps: TourStep[];
  onComplete?: () => void;
  onSkip?: () => void;
  autoStart?: boolean; // Auto-start on mount (default: true)
}

/**
 * OnboardingTour - A lightweight, one-time guided tour component
 * 
 * Features:
 * - 3-5 step tours for key feature discovery
 * - Always shows "Skip" button
 * - localStorage tracking (shows once)
 * - Analytics integration
 * - Element highlighting with spotlight effect
 * 
 * Usage:
 * ```tsx
 * const tourSteps = [
 *   {
 *     id: 'step-1',
 *     title: 'Welcome to ManaTap!',
 *     description: 'Let\'s show you around',
 *     placement: 'center'
 *   },
 *   {
 *     id: 'step-2',
 *     title: 'Cost to Finish',
 *     description: 'See what cards you need to complete your deck',
 *     target: '#cost-to-finish-button',
 *     placement: 'bottom'
 *   }
 * ];
 * 
 * <OnboardingTour
 *   tourId="main-features-v1"
 *   steps={tourSteps}
 *   onComplete={() => console.log('Tour completed!')}
 * />
 * ```
 */
export default function OnboardingTour({
  tourId,
  steps,
  onComplete,
  onSkip,
  autoStart = true,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);

  // Check if tour has been completed (run only once on mount)
  useEffect(() => {
    let mounted = true;
    
    try {
      const key = `tour-${tourId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const data = JSON.parse(stored);
        if (data.completed) {
          console.log(`[Tour] Tour ${tourId} already completed, skipping`);
          if (mounted) setHasCompleted(true);
          return;
        }
      }

      // Auto-start if enabled and not completed
      if (autoStart) {
        // Small delay to ensure DOM is ready
        const timer = setTimeout(() => {
          if (mounted) {
            console.log(`[Tour] Starting tour ${tourId}`);
            setIsActive(true);
            trackStep(0, 'started');
            
            // Track onboarding started with new analytics
            trackOnboardingStarted({ tour_id: tourId });
          }
        }, 500);
        
        return () => {
          mounted = false;
          clearTimeout(timer);
        };
      }
    } catch (e) {
      console.error('Failed to check tour completion:', e);
    }
    
    return () => { mounted = false; };
  }, [tourId, autoStart]); // Removed hasCompleted from deps to prevent re-runs

  // Update target element position when step changes
  useEffect(() => {
    if (!isActive) return;

    const step = steps[currentStep];
    if (step?.target) {
      const updatePosition = () => {
        try {
          const element = document.querySelector(step.target!);
          if (element) {
            const rect = element.getBoundingClientRect();
            setTargetRect(rect);
            
            // Scroll element into view if needed
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            // Element not found - show in center instead of bugging out
            console.warn(`Tour step ${currentStep}: Target element "${step.target}" not found, showing tour in center`);
            setTargetRect(null);
          }
        } catch (e) {
          console.error('Failed to find target element:', e);
          setTargetRect(null);
        }
      };

      updatePosition();

      // Update on window resize
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    } else {
      setTargetRect(null);
    }
  }, [currentStep, steps, isActive]);

  const trackStep = useCallback((stepIndex: number, action: 'started' | 'completed' | 'skipped') => {
    try {
      capture('onboarding_tour_step', {
        tour_id: tourId,
        step_id: steps[stepIndex]?.id,
        step_index: stepIndex,
        action,
      });
    } catch (e) {
      console.error('Failed to track tour step:', e);
    }
  }, [tourId, steps]);

  const handleNext = () => {
    trackStep(currentStep, 'completed');
    
    // Track step completion with enhanced analytics
    const step = steps[currentStep];
    if (step) {
      trackOnboardingStep(currentStep + 1, step.id);
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      trackStep(currentStep + 1, 'started');
    } else {
      completeTour();
    }
  };

  const handleSkip = () => {
    trackStep(currentStep, 'skipped');
    
    try {
      capture('onboarding_tour_skipped', {
        tour_id: tourId,
        step_index: currentStep,
        total_steps: steps.length,
      });
      
      // Track with enhanced analytics
      trackOnboardingSkipped(currentStep + 1, 'user_clicked_skip');
    } catch {}

    markAsCompleted(false);
    setIsActive(false);
    if (onSkip) onSkip();
  };

  const completeTour = () => {
    try {
      capture('onboarding_tour_completed', {
        tour_id: tourId,
        total_steps: steps.length,
      });
      
      // Track with enhanced analytics
      trackOnboardingCompleted(steps.length, undefined, { tour_id: tourId });
    } catch {}

    markAsCompleted(true);
    setIsActive(false);
    if (onComplete) onComplete();
  };

  const markAsCompleted = (fullyCompleted: boolean) => {
    try {
      const key = `tour-${tourId}`;
      localStorage.setItem(key, JSON.stringify({
        completed: true,
        fullyCompleted,
        completedAt: Date.now(),
      }));
      setHasCompleted(true);
    } catch (e) {
      console.error('Failed to mark tour as completed:', e);
    }
  };

  // Don't render if already completed or not active
  if (hasCompleted || !isActive || steps.length === 0) {
    return null;
  }

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const getTooltipPosition = (): React.CSSProperties => {
    if (!step.target || !targetRect) {
      // Center placement (no target)
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10002,
      };
    }

    const offset = 16;
    const tooltipHeight = 400; // Estimated tooltip height (increased for safety)
    const tooltipWidth = Math.min(450, window.innerWidth - 40); // Responsive width
    const minMargin = 20; // Minimum pixels from any screen edge
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 10002,
      maxWidth: '90vw', // Ensure it never exceeds viewport
    };
    
    // Helper to check if element is near bottom of screen
    const isNearBottom = targetRect.bottom > viewportHeight * 0.6;
    
    // Helper to check if we're on a small screen
    const isSmallScreen = viewportWidth < 768;
    
    switch (step.placement) {
      case 'top':
        // Place above the target
        const topPos = targetRect.top - tooltipHeight - offset;
        if (topPos < minMargin) {
          // Not enough space above, place below instead
          style.top = `${Math.min(targetRect.bottom + offset, viewportHeight - tooltipHeight - minMargin)}px`;
        } else {
          style.top = `${topPos}px`;
        }
        style.left = '50%';
        style.transform = 'translateX(-50%)';
        break;
        
      case 'bottom':
        // Place below the target
        const bottomPos = targetRect.bottom + offset;
        const spaceBelow = viewportHeight - bottomPos;
        
        // On small screens or if not enough space, center it in viewport
        if (isSmallScreen || spaceBelow < tooltipHeight + minMargin) {
          // Center vertically in viewport
          style.top = '50%';
          style.transform = 'translate(-50%, -50%)';
        } else {
          // Enough space, place normally below target
          style.top = `${Math.min(bottomPos, viewportHeight - tooltipHeight - minMargin)}px`;
          style.transform = 'translateX(-50%)';
        }
        
        // Always center horizontally on small screens
        style.left = '50%';
        break;
        
      case 'left':
        const leftSpace = targetRect.left - offset;
        if (isSmallScreen || leftSpace < tooltipWidth) {
          // Not enough space on left, center instead
          style.top = '50%';
          style.left = '50%';
          style.transform = 'translate(-50%, -50%)';
        } else {
          style.right = `${viewportWidth - targetRect.left + offset}px`;
          style.top = `${Math.max(minMargin, Math.min(
            targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
            viewportHeight - tooltipHeight - minMargin
          ))}px`;
        }
        break;
        
      case 'right':
        const rightSpace = viewportWidth - targetRect.right - offset;
        if (isSmallScreen || rightSpace < tooltipWidth) {
          // Not enough space on right, center instead
          style.top = '50%';
          style.left = '50%';
          style.transform = 'translate(-50%, -50%)';
        } else {
          style.left = `${Math.min(targetRect.right + offset, viewportWidth - tooltipWidth - minMargin)}px`;
          style.top = `${Math.max(minMargin, Math.min(
            targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
            viewportHeight - tooltipHeight - minMargin
          ))}px`;
        }
        break;
        
      default:
        // Center if no placement specified
        style.top = '50%';
        style.left = '50%';
        style.transform = 'translate(-50%, -50%)';
    }

    return style;
  };

  return (
    <>
      {/* Backdrop overlay - no blur */}
      <div
        className="fixed inset-0 bg-black/50 z-[10000]"
        style={{ animation: 'fadeIn 0.3s ease-in' }}
      />

      {/* Spotlight on target element - simple border highlight, no masking */}
      {step.target && targetRect && (
        <div
          className="fixed z-[10001] pointer-events-none border-4 border-blue-500"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: '12px',
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.5)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Tour card */}
      <div
        style={getTooltipPosition()}
        className="bg-gradient-to-br from-blue-950 via-purple-950 to-blue-950 text-white rounded-2xl shadow-2xl border-2 border-blue-500/30 max-w-[90vw] sm:max-w-md w-full mx-4"
      >
        {/* Progress bar */}
        <div className="h-1 bg-blue-900/30 rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          {/* Step counter */}
          <div className="flex items-center justify-between text-xs sm:text-sm opacity-80">
            <span>Step {currentStep + 1} of {steps.length}</span>
            <button
              onClick={handleSkip}
              className="hover:opacity-100 opacity-60 transition-opacity underline"
            >
              Skip tour
            </button>
          </div>

          {/* Content */}
          <div className="space-y-2 sm:space-y-3">
            <h3 className="text-lg sm:text-2xl font-bold text-white">{step.title}</h3>
            <p className="text-sm sm:text-base text-white/90 leading-relaxed">{step.description}</p>
          </div>

          {/* Action button if provided */}
          {step.action && (
            <button
              onClick={() => {
                step.action!.onClick();
                handleNext();
              }}
              className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 font-semibold transition-all transform hover:scale-105"
            >
              {step.action.label}
            </button>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-2">
            {currentStep > 0 && (
              <button
                onClick={() => {
                  trackStep(currentStep, 'skipped');
                  setCurrentStep(currentStep - 1);
                  trackStep(currentStep - 1, 'started');
                }}
                className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 transition-colors"
              >
                ← Back
              </button>
            )}
            
            <button
              onClick={handleNext}
              className="flex-1 py-2 px-4 rounded-lg bg-white text-blue-950 font-semibold hover:bg-blue-50 transition-colors"
            >
              {currentStep === steps.length - 1 ? '✓ Finish' : 'Next →'}
            </button>
          </div>

          {/* Step indicators (dots) */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-6 bg-white'
                    : idx < currentStep
                    ? 'w-2 bg-green-400'
                    : 'w-2 bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { 
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.5);
            opacity: 1;
          }
          50% { 
            box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.5), 0 0 30px rgba(59, 130, 246, 0.7);
            opacity: 0.9;
          }
        }
      `}</style>
    </>
  );
}

/**
 * Reset a tour (useful for testing or user preference)
 */
export function resetTour(tourId: string) {
  try {
    const key = `tour-${tourId}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Failed to reset tour:', e);
  }
}

/**
 * Check if a tour has been completed
 */
export function isTourCompleted(tourId: string): boolean {
  try {
    const key = `tour-${tourId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const data = JSON.parse(stored);
      return Boolean(data.completed);
    }
  } catch (e) {
    console.error('Failed to check tour completion:', e);
  }
  return false;
}

