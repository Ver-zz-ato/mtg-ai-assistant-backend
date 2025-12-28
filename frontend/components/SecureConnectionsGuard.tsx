'use client';

import { useEffect } from 'react';
import { initConnectionSanityCheck } from '@/lib/connection-sanity-check';

/**
 * Client component that runs connection sanity checks on mount
 * 
 * This performs:
 * 1. Startup check: Protocol mismatches (http:// URLs on https:// pages)
 * 2. Runtime error hooks: Catches WebSocket/mixed content errors
 * 
 * All checks run once per session and report to analytics.
 */
export default function SecureConnectionsGuard() {
  useEffect(() => {
    // Initialize all sanity checks (startup check + error hooks)
    const cleanup = initConnectionSanityCheck();
    
    // Cleanup on unmount (though component typically doesn't unmount)
    return cleanup;
  }, []);

  return null; // This component doesn't render anything
}
