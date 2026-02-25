/**
 * Web Vitals tracking for PostHog
 * 
 * Tracks Core Web Vitals (LCP, FID, CLS, INP, FCP, TTFB) and other performance metrics.
 * Each metric is sent exactly once per page load to prevent duplicates.
 * 
 * Usage:
 *   import { initWebVitals } from '@/lib/analytics/webVitals';
 *   initWebVitals(); // Call after PostHog is initialized
 */

import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB } from 'web-vitals';
import { capture } from '@/lib/ph';
import { AnalyticsEvents } from './events';

type Metric = {
  name: string;
  value: number;
  id: string;
  delta: number;
  rating: 'good' | 'needs-improvement' | 'poor';
};

function sendToPostHog(metric: Metric) {
  capture(`${AnalyticsEvents.WEB_VITAL}_${metric.name}`, {
    value: Math.round(metric.value),
    id: metric.id,
    delta: Math.round(metric.delta),
    rating: metric.rating,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
  });
}

let initialized = false;
let retryCount = 0;
const MAX_RETRIES = 5;

/**
 * Initialize Web Vitals tracking
 * 
 * Should be called once after PostHog is initialized and consent is granted.
 * Safe to call multiple times (will only initialize once).
 */
export function initWebVitals() {
  if (typeof window === 'undefined' || initialized) return;
  
  const ph: any = (typeof window !== 'undefined' && (window as any).posthog) || null;
  if (!ph?._loaded) {
    if (retryCount >= MAX_RETRIES) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[webVitals] PostHog not ready after max retries, skipping');
      }
      return;
    }
    retryCount++;
    if (process.env.NODE_ENV === 'development' && retryCount === 1) {
      console.warn('[webVitals] PostHog not ready, deferring initialization');
    }
    setTimeout(() => {
      if (!initialized) initWebVitals();
    }, 500 * retryCount);
    return;
  }
  
  initialized = true;

  // Core Web Vitals
  onCLS(sendToPostHog);
  onFCP(sendToPostHog);
  onFID(sendToPostHog);
  onINP(sendToPostHog);
  onLCP(sendToPostHog);
  onTTFB(sendToPostHog);
}
