// lib/analytics-performance.ts
// Error and performance analytics

import { capture } from './ph';

export type ErrorEventType = 
  | 'error.api_failure'
  | 'error.client_error' 
  | 'error.network_timeout'
  | 'error.validation_failed';

export type PerformanceEventType =
  | 'performance.api_latency'
  | 'performance.page_load'
  | 'performance.component_render'
  | 'performance.search_query';

export interface ErrorEventProps {
  error_type: string;         // 'network', 'validation', 'server', etc.
  error_message?: string;     // Error message (sanitized)
  error_code?: string | number; // HTTP status or error code
  component?: string;         // Component where error occurred
  api_endpoint?: string;      // API endpoint that failed
  user_action?: string;       // What user was trying to do
  retry_count?: number;       // Number of retry attempts
}

export interface PerformanceEventProps {
  operation: string;          // What was being measured
  duration_ms: number;        // How long it took
  component?: string;         // Component being measured
  api_endpoint?: string;      // API endpoint measured
  data_size?: number;         // Size of data processed
  cache_hit?: boolean;        // Whether cache was used
}

export function trackError(event: ErrorEventType, props: ErrorEventProps) {
  try {
    // Sanitize sensitive information
    const sanitizedProps = {
      ...props,
      error_message: sanitizeErrorMessage(props.error_message),
      event_category: 'error',
      timestamp: new Date().toISOString(),
    };
    
    capture(event, sanitizedProps);
    
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[Analytics Error]', event, sanitizedProps);
    }
  } catch {}
}

export function trackPerformance(event: PerformanceEventType, props: PerformanceEventProps) {
  try {
    const enrichedProps = {
      ...props,
      event_category: 'performance',
      timestamp: new Date().toISOString(),
    };
    
    capture(event, enrichedProps);
  } catch {}
}

// Sanitize error messages to remove sensitive data
function sanitizeErrorMessage(message?: string): string {
  if (!message) return 'Unknown error';
  
  // Remove potential API keys, tokens, emails, etc.
  return message
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/[a-zA-Z0-9]{20,}/g, '[TOKEN]')
    .replace(/password|token|key|secret/gi, '[REDACTED]')
    .substring(0, 200); // Limit length
}

// API call wrapper with automatic performance and error tracking
export async function trackApiCall<T>(
  endpoint: string,
  operation: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await apiCall();
    const duration = performance.now() - startTime;
    
    trackPerformance('performance.api_latency', {
      operation,
      duration_ms: Math.round(duration),
      api_endpoint: endpoint,
    });
    
    return result;
  } catch (error: any) {
    const duration = performance.now() - startTime;
    
    trackError('error.api_failure', {
      error_type: 'api_call',
      error_message: error?.message,
      error_code: error?.status || error?.code,
      api_endpoint: endpoint,
      user_action: operation,
    });
    
    // Still track performance for failed calls
    trackPerformance('performance.api_latency', {
      operation: `${operation}_failed`,
      duration_ms: Math.round(duration),
      api_endpoint: endpoint,
    });
    
    throw error; // Re-throw to maintain normal error handling
  }
}

// Component render performance tracker
export function useRenderPerformance(componentName: string) {
  const startTime = performance.now();
  
  return {
    trackRenderComplete: () => {
      const duration = performance.now() - startTime;
      trackPerformance('performance.component_render', {
        operation: 'render',
        duration_ms: Math.round(duration),
        component: componentName,
      });
    }
  };
}