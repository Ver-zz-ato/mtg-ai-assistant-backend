'use client';
import React from 'react';
import posthog from 'posthog-js';
import { toast } from '@/lib/toast-client';

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    try {
      posthog.capture('ui_error', {
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        componentStack: String(info?.componentStack || ''),
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      });
    } catch {}
    try { fetch('/api/admin/errors', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ kind:'ui', message: String(error?.message||''), stack: String(info?.componentStack||''), path: typeof window !== 'undefined' ? window.location.pathname : '' }) }); } catch {}
    try { toast('Something went wrong. Please try again.', 'error'); } catch {}
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children as any;
  }
}