/**
 * Centralized logging utility
 * Provides consistent logging across the application with environment-aware behavior
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

/**
 * Logger utility with environment-aware behavior
 */
class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';

  /**
   * Debug logs - only in development
   */
  debug(message: string, ...args: any[]): void {
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Info logs - development console, production analytics (optional)
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context || '');
    }
    // In production, could send to analytics/monitoring
    // Example: captureServer('log_info', { message, ...context });
  }

  /**
   * Warning logs - always logged, sent to monitoring in production
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context || '');
    // In production, send to monitoring (e.g., Sentry)
    if (this.isProduction && typeof window === 'undefined') {
      // Server-side: could send to Sentry
      // Example: Sentry.captureMessage(message, { level: 'warning', extra: context });
    }
  }

  /**
   * Error logs - always logged, sent to Sentry in production
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    console.error(`[ERROR] ${message}`, error || '', context || '');
    
    // In production, send to Sentry
    if (this.isProduction && typeof window === 'undefined') {
      // Server-side: send to Sentry
      // Example:
      // if (error instanceof Error) {
      //   Sentry.captureException(error, { extra: context });
      // } else {
      //   Sentry.captureMessage(message, { level: 'error', extra: { error, ...context } });
      // }
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing
export { Logger };




