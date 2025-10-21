'use client';

import { useEffect } from 'react';

/**
 * One-time cleanup: Unregisters all service workers
 * Remove this component after a few days once all users have cleared their SW
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length > 0) {
        console.log('[SW Cleanup] Unregistering old service workers...');
        registrations.forEach((registration) => {
          registration.unregister();
        });
        // Clear all caches
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
        });
      }
    });
  }, []);

  return null;
}

