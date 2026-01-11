/**
 * HTML Sanitization Utilities
 * 
 * Uses DOMPurify to sanitize user-generated or AI-generated HTML content
 * to prevent XSS attacks.
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content using DOMPurify
 * Works in both Node.js (server) and browser (client) environments
 * 
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
export function sanitizeHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  try {
    // DOMPurify configuration - allow common safe HTML tags
    const config = {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'span', 'div',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'blockquote', 'code', 'pre'
      ],
      ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: true,
      // Remove script tags and event handlers
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    };

    return DOMPurify.sanitize(html, config);
  } catch (error) {
    console.error('[sanitizeHTML] Error sanitizing HTML:', error);
    // Fail safe: strip all HTML tags on error
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Validate and sanitize URLs to prevent javascript: or data: XSS
 * 
 * @param url - URL to validate
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeURL(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  if (trimmed.startsWith('javascript:') || 
      trimmed.startsWith('data:') || 
      trimmed.startsWith('vbscript:') ||
      trimmed.startsWith('file:') ||
      trimmed.startsWith('about:')) {
    return null;
  }

  // Allow http, https, mailto, tel, and relative URLs
  if (trimmed.startsWith('http://') || 
      trimmed.startsWith('https://') || 
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('#')) {
    try {
      // Validate URL format
      new URL(url, 'https://example.com');
      return url; // Return original (with protocol preserved)
    } catch {
      return null; // Invalid URL format
    }
  }

  // Relative URLs (no protocol) are safe
  if (!trimmed.includes('://')) {
    return url;
  }

  return null; // Unknown protocol
}
