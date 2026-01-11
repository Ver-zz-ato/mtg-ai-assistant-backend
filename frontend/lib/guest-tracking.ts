/**
 * Guest Session Tracking
 * 
 * Server-side tracking for guest users to prevent abuse.
 * Uses HMAC-signed tokens stored in HttpOnly cookies to prevent client manipulation.
 * 
 * Note: Uses Web Crypto API for Edge runtime compatibility (middleware runs on Edge).
 */

const GUEST_TOKEN_SECRET = process.env.GUEST_TOKEN_SECRET || 'default-secret-change-in-production';

/**
 * Hash a string using SHA-256 for secondary tracking (IP, User-Agent)
 * Returns hex-encoded hash
 * Works in both Node.js and Edge runtime
 */
export async function hashString(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    // Edge runtime - use Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js runtime - fallback (shouldn't happen but keep for compatibility)
    const { createHash } = await import('crypto');
    return createHash('sha256').update(input).digest('hex');
  }
}

/**
 * Synchronous hash for Node.js runtime (for API routes)
 */
export function hashStringSync(input: string): string {
  // This will only work in Node.js runtime (API routes), not Edge (middleware)
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { createHash } = require('crypto');
    return createHash('sha256').update(input).digest('hex');
  }
  throw new Error('hashStringSync only works in Node.js runtime. Use hashString() for Edge.');
}

/**
 * Generate HMAC signature using Web Crypto API (Edge-compatible)
 */
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  // Import key for HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign message
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // Convert to base64url
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Verify HMAC signature using Web Crypto API (Edge-compatible)
 */
async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const expectedSignature = await hmacSign(message, secret);
  return signature === expectedSignature;
}

/**
 * Generate a signed guest token from IP address, User-Agent, and timestamp
 * Format: base64url(ip:userAgent:timestamp).base64url(hmac)
 * 
 * @param ip - IP address from request headers
 * @param userAgent - User-Agent header
 * @returns Signed token string (Promise for Edge compatibility)
 */
export async function generateGuestToken(ip: string, userAgent: string): Promise<string> {
  const timestamp = Date.now();
  const payload = `${ip}:${userAgent}:${timestamp}`;
  
  // Encode payload as base64url
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const encodedPayload = btoa(String.fromCharCode(...payloadBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Sign payload
  const signature = await hmacSign(payload, GUEST_TOKEN_SECRET);
  
  return `${encodedPayload}.${signature}`;
}

/**
 * Verify and extract data from a guest token
 * 
 * @param token - The signed token to verify
 * @returns Object with ip, userAgent, timestamp if valid, null if invalid (Promise for Edge compatibility)
 */
export async function verifyGuestToken(token: string): Promise<{ ip: string; userAgent: string; timestamp: number } | null> {
  try {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return null;
    }
    
    // Decode payload from base64url
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - base64.length % 4) % 4;
    const paddedBase64 = base64 + '='.repeat(padding);
    const payloadBytes = Uint8Array.from(atob(paddedBase64), c => c.charCodeAt(0));
    const decoder = new TextDecoder();
    const payload = decoder.decode(payloadBytes);
    const [ip, userAgent, timestampStr] = payload.split(':');
    
    if (!ip || !userAgent || !timestampStr) {
      return null;
    }
    
    // Verify signature
    const isValid = await hmacVerify(payload, signature, GUEST_TOKEN_SECRET);
    if (!isValid) {
      return null; // Invalid signature
    }
    
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return null;
    }
    
    // Token is valid for 30 days
    const tokenAge = Date.now() - timestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    
    if (tokenAge > maxAge) {
      return null; // Token expired
    }
    
    return { ip, userAgent, timestamp };
  } catch (error) {
    return null;
  }
}

/**
 * Generate a hash of the token for database storage
 * This is the primary key in guest_sessions table
 * Returns Promise for Edge compatibility
 */
export async function hashGuestToken(token: string): Promise<string> {
  return hashString(token);
}

/**
 * Extract IP address from request headers
 * Handles x-forwarded-for, x-real-ip, and direct connection
 */
export function extractIP(req: Request): string {
  // Try x-forwarded-for first (most common in production)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback to x-real-ip
  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  
  // Fallback (shouldn't happen in production with proper proxies)
  return 'unknown';
}

/**
 * Extract User-Agent from request headers
 */
export function extractUserAgent(req: Request): string {
  return req.headers.get('user-agent') || 'unknown';
}
