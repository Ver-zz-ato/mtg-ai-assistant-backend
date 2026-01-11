/**
 * Security Event Logging
 * 
 * Logs security-relevant events to Sentry and/or database for audit trail.
 * This provides "breadcrumbs" to prove what happened during security incidents.
 * 
 * Events logged:
 * - Rate limit triggered
 * - Guest token validation failed
 * - CSRF origin check failed
 * - Admin actions performed
 */

import * as Sentry from '@sentry/nextjs';

export type SecurityEventType =
  | 'rate_limit_triggered'
  | 'guest_token_validation_failed'
  | 'csrf_origin_check_failed'
  | 'admin_action_performed'
  | 'suspicious_activity';

export interface SecurityEvent {
  type: SecurityEventType;
  details: {
    user_id?: string;
    guest_token_hash?: string;
    ip_address?: string;
    user_agent?: string;
    route_path?: string;
    action?: string;
    reason?: string;
    [key: string]: any;
  };
}

/**
 * Log a security event to Sentry (with breadcrumb) and optionally to database
 * 
 * @param event - Security event to log
 * @param severity - Sentry severity level (default: 'warning')
 */
export function logSecurityEvent(
  event: SecurityEvent,
  severity: Sentry.SeverityLevel = 'warning'
): void {
  const { type, details } = event;

  // Log as Sentry breadcrumb for context
  Sentry.addBreadcrumb({
    category: 'security',
    level: severity,
    message: `Security Event: ${type}`,
    data: {
      ...details,
      event_type: type,
      timestamp: new Date().toISOString(),
    },
  });

  // For fatal events, also send as Sentry event (breadcrumbs are always added above)
  // Sentry severity levels: 'debug' | 'fatal' | 'warning' | 'log' | 'info'
  if (severity === 'fatal') {
    Sentry.captureMessage(`Security Event: ${type}`, {
      level: severity,
      tags: {
        security_event: type,
        route: details.route_path || 'unknown',
      },
      extra: details,
    });
  }

  // Console log in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[Security Event] ${type}:`, details);
  }
}

/**
 * Helper: Log rate limit triggered
 */
export function logRateLimitTriggered(
  keyHash: string,
  routePath: string,
  limit: number,
  count: number,
  isGuest: boolean = false
): void {
  logSecurityEvent({
    type: 'rate_limit_triggered',
    details: {
      key_hash: keyHash.substring(0, 16) + '...', // Truncate for privacy
      route_path: routePath,
      limit,
      count,
      is_guest: isGuest,
    },
  }, 'warning');
}

/**
 * Helper: Log guest token validation failure
 */
export function logGuestTokenValidationFailed(
  reason: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logSecurityEvent({
    type: 'guest_token_validation_failed',
    details: {
      reason,
      ip_address: ipAddress,
      user_agent: userAgent?.substring(0, 100), // Truncate for privacy
    },
  }, 'warning');
}

/**
 * Helper: Log CSRF origin check failure
 */
export function logCSRFFailure(
  routePath: string,
  origin?: string,
  referer?: string,
  ipAddress?: string
): void {
  logSecurityEvent({
    type: 'csrf_origin_check_failed',
    details: {
      route_path: routePath,
      origin: origin || 'missing',
      referer: referer || 'missing',
      ip_address: ipAddress,
    },
  }, 'warning');
}

/**
 * Helper: Log admin action (should already be in admin_audit table, but add Sentry breadcrumb)
 */
export function logAdminAction(
  adminUserId: string,
  action: string,
  target: string,
  details?: Record<string, any>
): void {
  logSecurityEvent({
    type: 'admin_action_performed',
    details: {
      admin_user_id: adminUserId,
      action,
      target,
      ...details,
    },
  }, 'info');
}
