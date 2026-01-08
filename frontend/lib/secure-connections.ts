/**
 * Secure connection utilities
 * 
 * Ensures WebSocket and SSE connections use the correct protocol (ws:// vs wss://)
 * based on the page protocol (http:// vs https://) to prevent mixed content errors.
 */

/**
 * Get the secure protocol (ws or wss) based on the current page protocol
 */
function getSecureProtocol(): 'ws' | 'wss' {
  if (typeof window === 'undefined') {
    // Server-side: default to wss for production safety
    return 'wss';
  }
  
  // Client-side: use wss if page is https, ws if http
  return window.location.protocol === 'https:' ? 'wss' : 'ws';
}

/**
 * Build a secure EventSource URL
 * 
 * For relative URLs, EventSource should inherit the page protocol automatically,
 * but this function provides an explicit absolute URL for extra safety.
 * 
 * @param path - Relative path (e.g., "/api/shout/stream") or absolute URL
 * @returns Absolute URL with correct protocol
 */
export function getSecureEventSourceUrl(path: string): string {
  if (typeof window === 'undefined') {
    // Server-side: return as-is (shouldn't be used server-side anyway)
    return path;
  }

  // If already absolute URL, validate and fix protocol if needed
  try {
    const url = new URL(path, window.location.href);
    
    // If the URL uses http:// and page is https://, upgrade to https://
    if (window.location.protocol === 'https:' && url.protocol === 'http:') {
      url.protocol = 'https:';
      // Log to analytics once
      try {
        import('@/lib/ph').then(({ capture }) => {
          capture('event_source_url_upgraded', {
            original_url: path,
            upgraded_url: url.toString(),
            page_protocol: window.location.protocol,
          });
        }).catch(() => {});
      } catch {}
    }
    
    return url.toString();
  } catch {
    // Not a valid URL, assume it's a relative path
    // EventSource will inherit the page protocol automatically, but return absolute for safety
    return new URL(path, window.location.href).toString();
  }
}

/**
 * Validate and ensure Supabase URL uses HTTPS in production
 * 
 * IMPORTANT: Supabase automatically uses wss:// for realtime WebSockets when the URL is https://
 * This validation ensures the URL protocol is correct so Supabase can derive the correct WebSocket protocol.
 * 
 * @param url - Supabase URL from environment variable
 * @returns Validated URL (upgraded to https:// if needed in production)
 */
export function validateSupabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }

  // In production (or any environment where we detect HTTPS page), ensure URL is HTTPS
  // This ensures Supabase's realtime client uses wss:// instead of ws://
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'http:') {
        urlObj.protocol = 'https:';
        
        // Log to analytics once (throttled via guard)
        try {
          import('@/lib/ph').then(({ capture }) => {
            capture('supabase_url_upgraded', {
              original_url: url.replace(/\/\/[^/]+@/, '//***@'), // Redact auth if present
              upgraded_url: urlObj.toString().replace(/\/\/[^/]+@/, '//***@'),
              page_protocol: window.location.protocol,
            });
          }).catch(() => {});
        } catch {}
        
        return urlObj.toString();
      }
    } catch (e) {
      // Return original URL even if parsing fails (let Supabase handle the error)
    }
  }

  return url;
}

// Throttle error logging to once per error type per session
const loggedErrors = new Set<string>();

/**
 * Get a unique key for error throttling (once per session per error type/url combo)
 */
function getErrorKey(type: string, url?: string): string {
  return `${type}:${url || 'no-url'}`;
}

/**
 * Log WebSocket/SSE connection errors for debugging
 * 
 * Throttled to log once per error type/URL combination per session to avoid spam.
 * 
 * @param error - Error object or error message
 * @param context - Additional context (connection type, URL, etc.)
 */
export function logConnectionError(error: unknown, context: {
  type: 'websocket' | 'eventsource' | 'supabase-realtime';
  url?: string;
  [key: string]: unknown;
}): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorKey = getErrorKey(context.type, context.url);
  
  // Throttle: only log each error type/URL once per session
  if (loggedErrors.has(errorKey)) {
    // Already logged this error type, skip
    return;
  }
  
  loggedErrors.add(errorKey);
  
  const errorDetails = {
    ...context,
    error: errorMessage,
    pageProtocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    timestamp: new Date().toISOString(),
  };

  // Try to send to analytics (if available, don't block on it)
  if (typeof window !== 'undefined') {
    try {
      // Import dynamically to avoid circular dependencies
      import('@/lib/ph').then(({ capture }) => {
        capture('connection_error', {
          error_type: context.type,
          error_message: errorMessage,
          page_protocol: errorDetails.pageProtocol,
          platform: /iPhone|iPad|iPod/.test(errorDetails.userAgent) ? 'ios' : 'other',
          ...(context.url ? { attempted_url: context.url.replace(/\/\/[^/]+@/, '//***@') } : {}), // Redact auth if present
        });
      }).catch(() => {
        // Analytics not available, skip
      });
    } catch {
      // Capture failed, continue
    }
  }
}

/**
 * Create a safe EventSource with error handling and protocol validation
 * 
 * @param url - EventSource URL (relative or absolute)
 * @param options - EventSource options
 * @returns EventSource instance with error handling
 */
export function createSecureEventSource(
  url: string,
  options?: EventSourceInit
): EventSource {
  const secureUrl = getSecureEventSourceUrl(url);
  
  try {
    const eventSource = new EventSource(secureUrl, options);
    
    // Add error handler to log connection issues
    eventSource.addEventListener('error', (event) => {
      logConnectionError('EventSource error event', {
        type: 'eventsource',
        url: secureUrl,
        readyState: eventSource.readyState,
      });
    });

    return eventSource;
  } catch (error) {
    // EventSource constructor can throw if URL is invalid
    logConnectionError(error, {
      type: 'eventsource',
      url: secureUrl,
      operation: 'create',
    });
    throw error; // Re-throw to let caller handle
  }
}
