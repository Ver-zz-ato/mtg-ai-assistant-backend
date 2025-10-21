'use client';

import { useEffect } from 'react';

/**
 * AGGRESSIVE cleanup: Unregisters ALL service workers on EVERY page load
 * Keeps running until SW is fully eliminated from all users
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Run immediately
    const cleanupServiceWorker = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        
        if (registrations.length > 0) {
          console.log('[SW Cleanup] Found service workers, unregistering ALL...');
          
          // Unregister all service workers
          await Promise.all(registrations.map(reg => reg.unregister()));
          
          // Clear all caches
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          
          console.log('[SW Cleanup] ✓ All service workers and caches cleared');
          
          // Force reload to ensure clean state (only if we actually cleaned something)
          if (registrations.length > 0) {
            console.log('[SW Cleanup] Reloading page for clean state...');
            setTimeout(() => window.location.reload(), 100);
          }
        } else {
          console.log('[SW Cleanup] No service workers found - all clear!');
        }
      } catch (error) {
        console.error('[SW Cleanup] Error during cleanup:', error);
      }
    };

    cleanupServiceWorker();
    
    // Also cleanup on visibility change (when user comes back to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        cleanupServiceWorker();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}

