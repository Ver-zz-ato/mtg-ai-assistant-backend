/**
 * CSRF Protection Utilities
 * 
 * Validates Origin/Referer headers to prevent cross-site request forgery attacks.
 * Used for sensitive routes (billing, admin, profile updates).
 */

import type { NextRequest } from 'next/server';

/**
 * Get allowed origins from environment variable or use defaults
 */
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map(o => o.trim()).filter(Boolean);
  }
  
  // Default allowed origins
  return [
    'https://www.manatap.ai',
    'https://manatap.ai',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
}

/**
 * Validate Origin or Referer header against allowed origins
 * 
 * @param req - NextRequest object
 * @returns true if valid, false if invalid or missing
 */
/**
 * Validate Origin or Referer header for CSRF protection
 * Logs security events on validation failures.
 * Note: When users land via search (e.g. Referer: duckduckgo.com), POSTs may get 403.
 * Clients should catch 403 and show a friendly message (e.g. "Refresh and try again") instead of throwing.
 */
export function validateOrigin(req: NextRequest, routePath?: string): boolean {
  // Extract route path automatically if not provided
  const actualRoutePath = routePath || req.nextUrl.pathname || 'unknown';
  
  // Extract Origin header (preferred) or fallback to Referer
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  
  const sourceUrl = origin || referer;
  if (!sourceUrl) {
    // Some legitimate requests (like same-origin fetch) might not send Origin
    // But for sensitive operations, we should require it
    // Log security event for missing Origin/Referer
    try {
      // Dynamic import to avoid circular dependencies
      import('./security-events').then(({ logCSRFFailure }) => {
        logCSRFFailure(actualRoutePath, undefined, undefined, req.headers.get('x-forwarded-for') || undefined);
      }).catch(() => {});
    } catch {}
    return false;
  }
  
  // Parse the origin from the URL
  let originHost: string;
  try {
    const url = new URL(sourceUrl);
    originHost = url.origin; // Includes protocol + hostname + port
  } catch {
    // Invalid URL format - log security event
    try {
      import('./security-events').then(({ logCSRFFailure }) => {
        logCSRFFailure(actualRoutePath, sourceUrl, referer || undefined, req.headers.get('x-forwarded-for') || undefined);
      }).catch(() => {});
    } catch {}
    return false;
  }
  
  const allowedOrigins = getAllowedOrigins();
  
  // Check if origin matches any allowed origin
  const isValid = allowedOrigins.some(allowed => {
    // Exact match
    if (originHost === allowed) {
      return true;
    }
    
    // Support wildcard subdomains (e.g., *.manatap.ai)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2); // Remove '*.' prefix
      const hostname = originHost.replace(/^https?:\/\//, '').split(':')[0]; // Extract hostname
      return hostname === domain || hostname.endsWith('.' + domain);
    }
    
    return false;
  });
  
  // Log security event if validation failed
  if (!isValid) {
    try {
      import('./security-events').then(({ logCSRFFailure }) => {
        logCSRFFailure(actualRoutePath, origin || undefined, referer || undefined, req.headers.get('x-forwarded-for') || undefined);
      }).catch(() => {});
    } catch {}
  }
  
  return isValid;
}

/**
 * Legacy function name (for backward compatibility)
 * @deprecated Use validateOrigin() directly
 */
export function sameOriginOk(req: NextRequest): boolean {
  return validateOrigin(req);
}

/**
 * Wrapper function for CSRF protection on API route handlers
 * 
 * @param handler - The route handler function
 * @returns Wrapped handler that validates Origin before executing
 */
export function withCSRFProtection<T>(
  handler: (req: NextRequest, ...args: any[]) => Promise<T>
): (req: NextRequest, ...args: any[]) => Promise<T | Response> {
  return async (req: NextRequest, ...args: any[]): Promise<T | Response> => {
    // Only check CSRF for state-changing methods
    const method = req.method.toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      // GET, HEAD, OPTIONS don't need CSRF protection
      return handler(req, ...args);
    }
    
    if (!validateOrigin(req)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Invalid origin. This request must come from the same site.',
          csrf_error: true,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    return handler(req, ...args);
  };
}
