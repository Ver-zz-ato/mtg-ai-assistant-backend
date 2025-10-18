"use client";

import React, { useState, useEffect } from 'react';

export interface ContextualTipProps {
  id: string; // Unique ID for localStorage tracking
  trigger: React.ReactNode; // Element that shows the tip (e.g., a "Why?" button)
  content: React.ReactNode; // The tip content
  placement?: 'top' | 'bottom' | 'left' | 'right';
  maxShowCount?: number; // Auto-dismiss after N shows (default: 1)
  onInteract?: () => void; // Called when user interacts with the trigger
}

/**
 * ContextualTip - A tooltip that auto-dismisses after the user has seen/interacted with it.
 * Perfect for onboarding hints like "Why?" toggles, format pills, etc.
 * 
 * Usage:
 * ```tsx
 * <ContextualTip
 *   id="budget-swap-why"
 *   trigger={<button>Why?</button>}
 *   content="Budget swaps suggest cheaper alternatives while maintaining similar power level."
 * />
 * ```
 */
export default function ContextualTip({
  id,
  trigger,
  content,
  placement = 'top',
  maxShowCount = 1,
  onInteract,
}: ContextualTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldShow, setShouldShow] = useState(true);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  // Check localStorage to see if tip has been dismissed
  useEffect(() => {
    try {
      const key = `contextual-tip-${id}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.showCount >= maxShowCount) {
          setShouldShow(false);
        }
      }
    } catch (e) {
      console.error('Failed to read contextual tip state:', e);
    }
  }, [id, maxShowCount]);

  // Track show count when opened
  useEffect(() => {
    if (isOpen && shouldShow) {
      try {
        const key = `contextual-tip-${id}`;
        const stored = localStorage.getItem(key);
        const data = stored ? JSON.parse(stored) : { showCount: 0 };
        data.showCount = (data.showCount || 0) + 1;
        data.lastShown = Date.now();
        localStorage.setItem(key, JSON.stringify(data));

        // Auto-dismiss if reached max
        if (data.showCount >= maxShowCount) {
          setShouldShow(false);
        }

        // Track analytics
        try {
          import('@/lib/ph').then(({ capture }) => {
            capture('contextual_tip_shown', {
              tip_id: id,
              show_count: data.showCount,
            });
          });
        } catch {}
      } catch (e) {
        console.error('Failed to update contextual tip state:', e);
      }
    }
  }, [isOpen, id, maxShowCount, shouldShow]);

  // Update position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTriggerRect(rect);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // If tip shouldn't show anymore, just render the trigger without tooltip
  if (!shouldShow) {
    return <>{trigger}</>;
  }

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (onInteract) onInteract();
  };

  const getTooltipStyle = (): React.CSSProperties => {
    if (!triggerRect) return {};

    const offset = 8; // pixels between trigger and tooltip
    let style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
    };

    switch (placement) {
      case 'top':
        style.bottom = `${window.innerHeight - triggerRect.top + offset}px`;
        style.left = `${triggerRect.left + triggerRect.width / 2}px`;
        style.transform = 'translateX(-50%)';
        break;
      case 'bottom':
        style.top = `${triggerRect.bottom + offset}px`;
        style.left = `${triggerRect.left + triggerRect.width / 2}px`;
        style.transform = 'translateX(-50%)';
        break;
      case 'left':
        style.right = `${window.innerWidth - triggerRect.left + offset}px`;
        style.top = `${triggerRect.top + triggerRect.height / 2}px`;
        style.transform = 'translateY(-50%)';
        break;
      case 'right':
        style.left = `${triggerRect.right + offset}px`;
        style.top = `${triggerRect.top + triggerRect.height / 2}px`;
        style.transform = 'translateY(-50%)';
        break;
    }

    return style;
  };

  return (
    <div ref={triggerRef} className="relative inline-block">
      <div onClick={handleToggle} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[9998]" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Tooltip */}
          <div
            style={getTooltipStyle()}
            className="bg-gradient-to-br from-blue-900 to-purple-900 text-white text-sm rounded-lg shadow-2xl border border-blue-500/30 p-4 max-w-xs animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Arrow indicator */}
            <div 
              className={`absolute w-2 h-2 bg-gradient-to-br from-blue-900 to-purple-900 border-blue-500/30 rotate-45 ${
                placement === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2 border-b border-r' :
                placement === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2 border-t border-l' :
                placement === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2 border-r border-t' :
                'left-[-4px] top-1/2 -translate-y-1/2 border-l border-b'
              }`}
            />
            
            <div className="relative z-10">
              {content}
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-2 right-2 text-white/60 hover:text-white text-xs"
              aria-label="Close tip"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Permanently dismiss a contextual tip (for "Don't show again" buttons)
 */
export function dismissContextualTip(id: string) {
  try {
    const key = `contextual-tip-${id}`;
    localStorage.setItem(key, JSON.stringify({
      showCount: 999,
      dismissed: true,
      lastShown: Date.now(),
    }));
  } catch (e) {
    console.error('Failed to dismiss contextual tip:', e);
  }
}

/**
 * Reset a contextual tip (for testing or user preference)
 */
export function resetContextualTip(id: string) {
  try {
    const key = `contextual-tip-${id}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Failed to reset contextual tip:', e);
  }
}

/**
 * Reset all contextual tips
 */
export function resetAllContextualTips() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('contextual-tip-'));
    keys.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Failed to reset all contextual tips:', e);
  }
}

