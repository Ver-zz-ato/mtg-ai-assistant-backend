/**
 * Comprehensive page-level analytics hook
 * Tracks: time on page, scroll depth, interactions, feature usage, exit intent
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { capture } from '@/lib/ph';
import { AnalyticsEvents } from '@/lib/analytics/events';

interface PageAnalyticsOptions {
  pageName?: string;
  trackTimeOnPage?: boolean;
  trackScrollDepth?: boolean;
  trackInteractions?: boolean;
  trackExitIntent?: boolean;
  minTimeOnPage?: number; // Minimum seconds before tracking
  scrollDepthThresholds?: number[]; // [25, 50, 75, 100] percentages
}

export function usePageAnalytics(options: PageAnalyticsOptions = {}) {
  const {
    pageName,
    trackTimeOnPage = true,
    trackScrollDepth = true,
    trackInteractions = true,
    trackExitIntent = true,
    minTimeOnPage = 5, // Only track if user spends at least 5 seconds
    scrollDepthThresholds = [25, 50, 75, 100]
  } = options;

  const pathname = usePathname();
  const startTimeRef = useRef<number>(Date.now());
  const scrollDepthRef = useRef<Set<number>>(new Set());
  const interactionCountRef = useRef<number>(0);
  const hasTrackedPageView = useRef<boolean>(false);
  const [timeOnPage, setTimeOnPage] = useState<number>(0);

  // Track page view on mount
  useEffect(() => {
    if (hasTrackedPageView.current) return;
    hasTrackedPageView.current = true;
    startTimeRef.current = Date.now();

    const page = pageName || pathname;
    const pageKey = page.replace(/^\//, '').replace(/\//g, '_') || 'home';
    
    capture(AnalyticsEvents.PAGE_VIEW, {
      page,
      page_key: pageKey, // Clean key for easier filtering (e.g., "price_tracker" instead of "/price-tracker")
      pathname,
      timestamp: new Date().toISOString(),
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    });
  }, [pathname, pageName]);

  // Track time on page
  useEffect(() => {
    if (!trackTimeOnPage) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setTimeOnPage(elapsed);
    }, 1000);

    return () => {
      clearInterval(interval);
      // Track final time on page when component unmounts
      const finalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (finalTime >= minTimeOnPage) {
        const page = pageName || pathname;
        const pageKey = page.replace(/^\//, '').replace(/\//g, '_') || 'home';
        capture(AnalyticsEvents.PAGE_TIME_ON_PAGE, {
          page,
          page_key: pageKey,
          seconds: finalTime,
          minutes: Math.floor(finalTime / 60),
          scroll_depth: Math.max(...Array.from(scrollDepthRef.current), 0),
          interactions: interactionCountRef.current
        });
      }
    };
  }, [trackTimeOnPage, minTimeOnPage, pageName, pathname]);

  // Track scroll depth
  useEffect(() => {
    if (!trackScrollDepth || typeof window === 'undefined') return;

    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollPercent = Math.round((scrollTop / (documentHeight - windowHeight)) * 100);

      // Track each threshold only once
      for (const threshold of scrollDepthThresholds) {
        if (scrollPercent >= threshold && !scrollDepthRef.current.has(threshold)) {
          scrollDepthRef.current.add(threshold);
          const page = pageName || pathname;
          const pageKey = page.replace(/^\//, '').replace(/\//g, '_') || 'home';
          capture(AnalyticsEvents.PAGE_SCROLL_DEPTH, {
            page,
            page_key: pageKey,
            depth_percent: threshold,
            scroll_position: scrollTop,
            document_height: documentHeight
          });
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [trackScrollDepth, scrollDepthThresholds, pageName, pathname]);

  // Track interactions (clicks, form inputs, etc.)
  useEffect(() => {
    if (!trackInteractions || typeof window === 'undefined') return;

    const handleInteraction = (event: Event) => {
      interactionCountRef.current += 1;
      
      const target = event.target as HTMLElement;
      const tagName = target?.tagName?.toLowerCase();
      const elementType = target?.getAttribute('type') || tagName;
      const elementId = target?.id || target?.getAttribute('data-testid') || '';
      const elementClass = target?.className || '';

      const page = pageName || pathname;
      const pageKey = page.replace(/^\//, '').replace(/\//g, '_') || 'home';
      
      capture(AnalyticsEvents.PAGE_INTERACTION, {
        page,
        page_key: pageKey,
        interaction_count: interactionCountRef.current,
        element_type: elementType,
        element_id: elementId,
        element_class: elementClass?.slice(0, 100), // Limit length
        interaction_type: event.type
      });
    };

    // Track various interaction types
    const events = ['click', 'input', 'change', 'submit', 'focus'];
    events.forEach(eventType => {
      document.addEventListener(eventType, handleInteraction, { passive: true });
    });

    return () => {
      events.forEach(eventType => {
        document.removeEventListener(eventType, handleInteraction);
      });
    };
  }, [trackInteractions, pageName, pathname]);

  // Track exit intent (mouse leaving viewport)
  useEffect(() => {
    if (!trackExitIntent || typeof window === 'undefined') return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Only track if mouse is moving upward (toward address bar)
      if (e.clientY <= 0) {
        const page = pageName || pathname;
        const pageKey = page.replace(/^\//, '').replace(/\//g, '_') || 'home';
        capture(AnalyticsEvents.PAGE_EXIT_INTENT, {
          page,
          page_key: pageKey,
          time_on_page: Math.floor((Date.now() - startTimeRef.current) / 1000),
          scroll_depth: Math.max(...Array.from(scrollDepthRef.current), 0),
          interactions: interactionCountRef.current
        });
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [trackExitIntent, pageName, pathname]);

  return {
    timeOnPage,
    scrollDepth: Math.max(...Array.from(scrollDepthRef.current), 0),
    interactions: interactionCountRef.current
  };
}
