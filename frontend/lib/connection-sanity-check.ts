/**
 * Connection Sanity Check
 * 
 * Self-reporting system to detect and diagnose WebSocket connection errors,
 * especially "WebSocket not available: The operation is insecure" on iOS Safari.
 * 
 * Runs once per session and reports issues to analytics for monitoring.
 */

// Session storage keys for "log once per session"
const STORAGE_KEY_PREFIX = 'connection_sanity_';
const STORAGE_KEY_STARTUP_CHECK = `${STORAGE_KEY_PREFIX}startup_done`;
const STORAGE_KEY_ERROR_LOGGED = `${STORAGE_KEY_PREFIX}error_logged`;

/**
 * Sanitize URL: Remove query string, hash, and auth tokens
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove auth if present
    if (urlObj.username || urlObj.password) {
      urlObj.username = '';
      urlObj.password = '';
    }
    // Remove query and hash
    urlObj.search = '';
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return as-is but remove obvious query/hash
    return url.split('?')[0].split('#')[0].replace(/\/\/[^/]+@/, '//***@');
  }
}

/**
 * Get app version/commit from environment (if available)
 */
function getAppVersion(): Record<string, string> {
  const version: Record<string, string> = {};
  
  if (typeof window !== 'undefined') {
    // Check if NEXT_PUBLIC_APP_VERSION is set
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
    if (appVersion) version.app_version = appVersion;
    
    // Check if NEXT_PUBLIC_COMMIT_SHA is set
    const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;
    if (commitSha) version.commit_sha = commitSha.substring(0, 7); // Short SHA
  }
  
  return version;
}

/**
 * Detect if user is on iOS
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Check if URL protocol matches page protocol requirements
 * Returns true if there's a mismatch that could cause issues
 * 
 * Rules:
 * - If page is https://, URL should be https:// (not http://) → mismatch
 * - If page is http://, http:// URL is OK (local dev) → no mismatch
 * - https:// URL on http:// page is OK → no mismatch
 */
export function checkProtocolMismatch(urlProtocol: string, pageProtocol: string): boolean {
  // If page is https://, URL should be https:// (not http://)
  if (pageProtocol === 'https:' && urlProtocol === 'http:') {
    return true;
  }
  return false;
}

/**
 * Startup sanity check: Run once per session
 * 
 * Checks:
 * - NEXT_PUBLIC_SUPABASE_URL protocol vs page protocol
 * - Any other WS/realtime endpoint env vars
 */
export function runStartupSanityCheck(): void {
  if (typeof window === 'undefined') return;
  
  // Check if already run this session
  try {
    if (sessionStorage.getItem(STORAGE_KEY_STARTUP_CHECK) === 'true') {
      return; // Already checked this session
    }
    sessionStorage.setItem(STORAGE_KEY_STARTUP_CHECK, 'true');
  } catch {
    // sessionStorage not available, continue anyway
  }
  
  const pageProtocol = window.location.protocol;
  const diagnostics: Record<string, unknown> = {
    page_protocol: pageProtocol,
    user_agent: navigator.userAgent,
    is_ios: isIOS(),
    timestamp: new Date().toISOString(),
    ...getAppVersion(),
  };
  
  let hasIssue = false;
  const issues: string[] = [];
  
  // Check NEXT_PUBLIC_SUPABASE_URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const urlObj = new URL(supabaseUrl);
      const sanitizedUrl = sanitizeUrl(supabaseUrl);
      diagnostics.supabase_url_protocol = urlObj.protocol;
      diagnostics.supabase_url_host = urlObj.host;
      
      if (checkProtocolMismatch(urlObj.protocol, pageProtocol)) {
        hasIssue = true;
        issues.push(`NEXT_PUBLIC_SUPABASE_URL uses ${urlObj.protocol} on ${pageProtocol} page`);
        diagnostics.supabase_url_mismatch = true;
        diagnostics.supabase_url_sanitized = sanitizedUrl;
      }
    } catch (e) {
      // URL parsing failed, log but don't treat as critical
      diagnostics.supabase_url_parse_error = String(e);
    }
  } else {
    diagnostics.supabase_url_missing = true;
  }
  
  // Check for other WS/realtime endpoints (if any exist in env)
  // Add more checks here if you add other WebSocket endpoints
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsUrl) {
    try {
      const urlObj = new URL(wsUrl);
      if (urlObj.protocol === 'ws:' && pageProtocol === 'https:') {
        hasIssue = true;
        issues.push(`NEXT_PUBLIC_WS_URL uses ws:// on https:// page`);
        diagnostics.ws_url_mismatch = true;
        diagnostics.ws_url_sanitized = sanitizeUrl(wsUrl);
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  // Report if issues found
  if (hasIssue) {
    console.error(
      '[connection-sanity-check] Protocol mismatch detected:\n' +
      issues.join('\n') +
      '\nThis may cause WebSocket connection errors on iOS Safari.'
    );
    
    // Send to analytics
    try {
      import('@/lib/ph').then(({ capture }) => {
        capture('connection_protocol_mismatch', {
          ...diagnostics,
          issues: issues.join('; '),
        });
      }).catch(() => {
        // Analytics not available
      });
    } catch {
      // Import failed
    }
  }
}

/**
 * Runtime error handler: Catch WebSocket/mixed content errors
 * 
 * Should be attached to window.onerror and unhandledrejection
 */
export function setupRuntimeErrorHooks(): () => void {
  if (typeof window === 'undefined') return () => {};
  
  // Track if we've already logged an error this session
  let errorLogged = false;
  try {
    errorLogged = sessionStorage.getItem(STORAGE_KEY_ERROR_LOGGED) === 'true';
  } catch {}
  
  const handleError = (event: ErrorEvent) => {
    const message = event.message || String(event.error || 'Unknown error');
    
    // Check if this is a WebSocket/mixed content error
    const lowerMessage = message.toLowerCase();
    const isWebSocketError = 
      lowerMessage.includes('websocket') ||
      lowerMessage.includes('operation is insecure') ||
      lowerMessage.includes('mixed content') ||
      lowerMessage.includes('mixedcontent');
    
    if (!isWebSocketError) return; // Not our concern
    
    // Log once per session
    if (errorLogged) {
      console.warn('[connection-sanity-check] WebSocket error detected (already reported to analytics):', message);
      return;
    }
    
    errorLogged = true;
    try {
      sessionStorage.setItem(STORAGE_KEY_ERROR_LOGGED, 'true');
    } catch {}
    
    const diagnostics: Record<string, unknown> = {
      error_message: message.substring(0, 200), // Limit length
      error_source: event.filename || 'unknown',
      page_protocol: window.location.protocol,
      user_agent: navigator.userAgent,
      is_ios: isIOS(),
      timestamp: new Date().toISOString(),
      ...getAppVersion(),
    };
    
    if (event.lineno) diagnostics.line_number = event.lineno;
    if (event.colno) diagnostics.column_number = event.colno;
    if (event.error) {
      diagnostics.error_type = event.error.name;
      diagnostics.error_stack = event.error.stack?.substring(0, 500); // Limit length
    }
    
    // Check Supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      try {
        const urlObj = new URL(supabaseUrl);
        diagnostics.supabase_url_protocol = urlObj.protocol;
        diagnostics.supabase_url_sanitized = sanitizeUrl(supabaseUrl);
      } catch {}
    }
    
    console.error('[connection-sanity-check] WebSocket connection error detected:', diagnostics);
    
    // Send to analytics
    try {
      import('@/lib/ph').then(({ capture }) => {
        capture('websocket_connection_error', diagnostics);
      }).catch(() => {});
    } catch {}
  };
  
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    
    // Check if this is a WebSocket error
    const lowerMessage = message.toLowerCase();
    const isWebSocketError = 
      lowerMessage.includes('websocket') ||
      lowerMessage.includes('operation is insecure') ||
      lowerMessage.includes('mixed content');
    
    if (!isWebSocketError) return;
    
    // Log once per session
    if (errorLogged) {
      console.warn('[connection-sanity-check] WebSocket promise rejection (already reported):', message);
      return;
    }
    
    errorLogged = true;
    try {
      sessionStorage.setItem(STORAGE_KEY_ERROR_LOGGED, 'true');
    } catch {}
    
    const diagnostics: Record<string, unknown> = {
      error_message: message.substring(0, 200),
      error_type: 'unhandled_rejection',
      page_protocol: window.location.protocol,
      user_agent: navigator.userAgent,
      is_ios: isIOS(),
      timestamp: new Date().toISOString(),
      ...getAppVersion(),
    };
    
    if (reason instanceof Error) {
      diagnostics.error_name = reason.name;
      diagnostics.error_stack = reason.stack?.substring(0, 500);
    }
    
    console.error('[connection-sanity-check] WebSocket promise rejection:', diagnostics);
    
    // Send to analytics
    try {
      import('@/lib/ph').then(({ capture }) => {
        capture('websocket_connection_error', diagnostics);
      }).catch(() => {});
    } catch {}
  };
  
  // Attach handlers
  window.addEventListener('error', handleError, true); // Use capture phase
  
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('error', handleError as EventListener, true);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

/**
 * Initialize all connection sanity checks
 * 
 * Should be called once on app startup (client-side only)
 */
export function initConnectionSanityCheck(): () => void {
  if (typeof window === 'undefined') return () => {};
  
  // Run startup check
  runStartupSanityCheck();
  
  // Setup runtime error hooks
  const cleanup = setupRuntimeErrorHooks();
  
  return cleanup;
}
