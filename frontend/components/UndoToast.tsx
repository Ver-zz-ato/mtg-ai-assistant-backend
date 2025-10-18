'use client';

import { useEffect, useState } from 'react';
import { useUndoToast } from '@/lib/undo-toast';

export default function UndoToast() {
  const { currentAction, undo, dismiss } = useUndoToast();
  const [timeLeft, setTimeLeft] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (currentAction) {
      const duration = currentAction.duration || 7000;
      setTimeLeft(duration);
      setIsVisible(true);

      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        setTimeLeft(remaining);

        if (remaining === 0) {
          clearInterval(interval);
          setTimeout(() => setIsVisible(false), 500); // Fade out
        }
      }, 50);

      return () => clearInterval(interval);
    } else {
      setIsVisible(false);
    }
  }, [currentAction]);

  if (!currentAction) return null;

  const progress = ((currentAction.duration || 7000) - timeLeft) / (currentAction.duration || 7000);
  const seconds = Math.ceil(timeLeft / 1000);

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl border border-gray-700 overflow-hidden min-w-[320px] max-w-md">
        {/* Progress bar */}
        <div className="h-1 bg-gray-700">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-50"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white mb-1">
                {currentAction.message}
              </p>
              <p className="text-xs text-gray-400">
                Undoing in {seconds} second{seconds !== 1 ? 's' : ''}...
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={dismiss}
              className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={undo}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded transition-colors"
            >
              Undo
            </button>
            <button
              onClick={dismiss}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors"
            >
              Keep Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

