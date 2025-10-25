'use client';

import { useEffect } from 'react';
import { trackFirstVisit } from '@/lib/analytics-enhanced';

export default function FirstVisitTracker() {
  useEffect(() => {
    // Only track on client side
    if (typeof window === 'undefined') return;
    
    // Check if this is truly a first visit
    const hasVisited = localStorage.getItem('analytics_first_visit');
    if (hasVisited) return;
    
    // Gather onboarding context
    const referrer = document.referrer || '';
    const urlParams = new URLSearchParams(window.location.search);
    const landing_page = window.location.pathname;
    
    // Extract UTM parameters
    const utm_source = urlParams.get('utm_source') || undefined;
    const utm_medium = urlParams.get('utm_medium') || undefined;
    const utm_campaign = urlParams.get('utm_campaign') || undefined;
    
    // Get basic device info
    const user_agent = navigator.userAgent;
    const screen_size = `${window.screen.width}x${window.screen.height}`;
    
    // Track first visit with rich context
    trackFirstVisit({
      referrer: referrer.slice(0, 200), // Truncate for privacy
      utm_source,
      utm_medium,
      utm_campaign,
      landing_page,
      user_agent: user_agent.slice(0, 200), // Truncate for storage
      screen_size
    });
    
  }, []); // Empty dependency array - only run once on mount
  
  // This component renders nothing
  return null;
}