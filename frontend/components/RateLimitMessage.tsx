'use client';

import { useEffect, useState } from 'react';

interface RateLimitMessageProps {
  retryAfter?: number; // seconds until retry is available
  feature?: string;
  onClose?: () => void;
}

export default function RateLimitMessage({
  retryAfter = 60,
  feature = "this feature",
  onClose,
}: RateLimitMessageProps) {
  const [timeLeft, setTimeLeft] = useState(retryAfter);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0
      ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${secs} second${secs !== 1 ? 's' : ''}`
      : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) {
      onClose();
    }
  };

  if (!isVisible) return null;

  if (timeLeft <= 0) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">✅</div>
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
              Ready to try again!
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300">
              You can now use {feature} again. Refresh the page or try your action again.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">⏳</div>
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
            Taking a quick break
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            You've been using {feature} quite a bit! To keep things running smoothly
            for everyone, please wait <strong>{formatTime(timeLeft)}</strong> before trying again.
          </p>
          
          {/* Suggestions for what to do while waiting */}
          <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 text-xs">
            <div className="font-medium text-amber-900 dark:text-amber-100 mb-2">
              While you wait, you can:
            </div>
            <ul className="space-y-1 text-amber-800 dark:text-amber-200">
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Browse your existing decks and collections</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Edit your deck offline - changes save automatically</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Check out the probability helpers and mulligan simulator</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Explore the blog for deck building tips</span>
              </li>
            </ul>
          </div>

          {/* Pro upgrade hint */}
          <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            💡 <strong>Pro tip:</strong> Pro members get higher rate limits and priority access.{' '}
            <a href="/pricing" className="underline hover:text-amber-800 dark:hover:text-amber-200">
              Learn more
            </a>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Compact version for inline use
export function RateLimitBanner({
  timeLeft,
  feature = "this feature",
}: {
  timeLeft: number;
  feature?: string;
}) {
  const minutes = Math.ceil(timeLeft / 60);
  
  return (
    <div className="bg-amber-100 dark:bg-amber-900/30 border-l-4 border-amber-500 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span>⏳</span>
        <span>
          Rate limit reached for {feature}. Please wait ~{minutes} minute{minutes !== 1 ? 's' : ''}.
          {' '}
          <a href="/pricing" className="underline font-medium">
            Upgrade to Pro
          </a>{' '}
          for higher limits.
        </span>
      </div>
    </div>
  );
}

