/**
 * Runtime guard to detect and warn about insecure WebSocket connections
 * 
 * This runs on page load to catch any protocol mismatches before connections are established.
 * 
 * DEPRECATED: Use initConnectionSanityCheck() from connection-sanity-check.ts instead.
 * This function is kept for backward compatibility.
 */

// Track if guard has already run (once per page load)
let guardHasRun = false;

/**
 * Runtime guard: Check and fix protocol mismatches
 * Should be called early in the app lifecycle (e.g., in layout or app root)
 * 
 * Safe to call multiple times - only runs once per page load.
 * 
 * @deprecated Use initConnectionSanityCheck() from connection-sanity-check.ts instead
 */
export function initSecureConnectionsGuard(): void {
  if (typeof window === 'undefined') return;
  
  // Only run once per page load
  if (guardHasRun) return;
  guardHasRun = true;

  // Delegate to the new connection sanity check system
  try {
    import('@/lib/connection-sanity-check').then(({ runStartupSanityCheck }) => {
      runStartupSanityCheck();
    }).catch(() => {
      // Fallback to old behavior if import fails
      const pageProtocol = window.location.protocol;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      if (pageProtocol === 'https:' && supabaseUrl) {
        try {
          const url = new URL(supabaseUrl);
          if (url.protocol === 'http:') {
            console.error(
              '[secure-connections-guard] CRITICAL: NEXT_PUBLIC_SUPABASE_URL uses http:// but page is https://\n' +
              'This will cause WebSocket connection errors on iOS Safari and other browsers.\n' +
              'Please update NEXT_PUBLIC_SUPABASE_URL to use https:// in production environment variables.'
            );
          }
        } catch (e) {
          console.warn('[secure-connections-guard] Could not parse NEXT_PUBLIC_SUPABASE_URL:', e);
        }
      }
    });
  } catch {
    // Import failed, skip
  }
}
