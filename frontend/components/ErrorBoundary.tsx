'use client';
import React from 'react';
import posthog from 'posthog-js';
import { toast } from '@/lib/toast-client';
import { trackError } from '@/lib/analytics-performance';

type ErrorBoundaryState = { 
  hasError: boolean; 
  errorId?: string;
  error?: Error;
};

export default class ErrorBoundary extends React.Component<{ 
  children: React.ReactNode;
  fallback?: React.ReactNode;
}, ErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { hasError: true, errorId, error };
  }

  componentDidCatch(error: any, info: any) {
    const errorId = this.state.errorId;
    
    // Enhanced error tracking with our new system
    trackError('error.client_error', {
      error_type: 'react_error_boundary',
      error_message: String(error?.message || error),
      component: this.extractComponentName(info?.componentStack),
      user_action: 'component_render',
    });
    
    // Legacy PostHog tracking (keep for compatibility)
    try {
      posthog.capture('ui_error', {
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        componentStack: String(info?.componentStack || ''),
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        error_id: errorId,
        timestamp: new Date().toISOString()
      });
    } catch {}
    
    // Server-side error logging
    try { 
      fetch('/api/admin/errors', { 
        method:'POST', 
        headers:{'content-type':'application/json'}, 
        body: JSON.stringify({ 
          kind:'ui', 
          message: String(error?.message||''), 
          stack: String(info?.componentStack||''), 
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          error_id: errorId,
          timestamp: new Date().toISOString()
        }) 
      }); 
    } catch {}
    
    try { toast('Something went wrong. Please try again.', 'error'); } catch {}
  }
  
  private extractComponentName(componentStack?: string): string {
    if (!componentStack) return 'unknown_component';
    const match = componentStack.match(/\s+at\s+(\w+)/);
    return match?.[1] || 'unknown_component';
  }
  
  private handleRetry = () => {
    this.setState({ hasError: false, errorId: undefined, error: undefined });
    try {
      posthog.capture('error_boundary_retry', {
        error_id: this.state.errorId,
        timestamp: new Date().toISOString()
      });
    } catch {}
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      // Default error UI with retry option
      return (
        <div className="flex items-center justify-center min-h-[200px] p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md w-full">
            <div className="flex items-center mb-2">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Something went wrong
                </h3>
              </div>
            </div>
            <div className="mt-2 text-sm text-red-700">
              <p>We encountered an unexpected error. Please try again.</p>
              {this.state.errorId && (
                <p className="mt-1 text-xs opacity-60">Error ID: {this.state.errorId}</p>
              )}
            </div>
            <div className="mt-4">
              <button
                onClick={this.handleRetry}
                className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}