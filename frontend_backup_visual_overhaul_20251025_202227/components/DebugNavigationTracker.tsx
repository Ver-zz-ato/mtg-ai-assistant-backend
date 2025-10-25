'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * DEBUG COMPONENT: Tracks navigation events and logs them to console
 * This helps debug the random logout issue by showing the sequence of events
 */
export default function DebugNavigationTracker() {
  const pathname = usePathname();

  useEffect(() => {
    console.log('🧭 [Navigation] Route changed to:', pathname, {
      timestamp: new Date().toISOString(),
      referrer: typeof document !== 'undefined' ? document.referrer : 'N/A'
    });
  }, [pathname]);

  useEffect(() => {
    // Log when window visibility changes (user switches tabs)
    const handleVisibilityChange = () => {
      console.log('👁️ [Visibility]', document.hidden ? 'Hidden' : 'Visible', {
        timestamp: new Date().toISOString()
      });
    };

    // Log focus/blur events
    const handleFocus = () => {
      console.log('🎯 [Focus] Window gained focus', { timestamp: new Date().toISOString() });
    };

    const handleBlur = () => {
      console.log('😴 [Blur] Window lost focus', { timestamp: new Date().toISOString() });
    };

    // Log beforeunload (user is leaving)
    const handleBeforeUnload = () => {
      console.log('👋 [Unload] Page is unloading', { timestamp: new Date().toISOString() });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Log initial mount
  useEffect(() => {
    console.log('🚀 [Navigation Tracker] Component mounted', {
      initialPath: pathname,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });
  }, []);

  return null; // Render nothing
}

