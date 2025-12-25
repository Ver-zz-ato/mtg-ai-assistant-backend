// lib/analytics-pro.ts
// Enhanced analytics for PRO feature funnel tracking

import { capture } from './ph';

export type ProEventType = 
  | 'pro_gate_viewed'      // User sees PRO badge/gate
  | 'pro_gate_clicked'     // User clicks on PRO gated feature
  | 'pro_upgrade_started'  // User clicks upgrade/pricing
  | 'pro_upgrade_completed'// Successful PRO subscription
  | 'pro_feature_used'     // PRO user uses premium feature
  | 'pro_downgrade'        // PRO user cancels/downgrades

export interface ProEventProps {
  feature?: string;           // Which feature was gated/used
  location?: string;          // Where the PRO gate appeared (alias for gate_location)
  gate_location?: string;     // Where the PRO gate appeared
  plan_suggested?: string;    // Suggested plan (e.g., 'monthly', 'annual')
  reason?: string;            // Why the gate appeared (e.g., 'feature_required', 'limit_reached')
  subscription_tier?: string; // Current user tier
  upgrade_source?: string;    // What prompted upgrade attempt ('gate' | 'pricing')
  user_tenure_days?: number;  // Days since user registered
}

export function captureProEvent(event: ProEventType, props?: ProEventProps) {
  try {
    const enrichedProps = {
      ...props,
      event_category: 'pro_funnel',
      timestamp: new Date().toISOString(),
    };
    
    capture(event, enrichedProps);
    
    // Also track to server-side analytics for revenue attribution
    if (event === 'pro_upgrade_completed') {
      fetch('/api/analytics/revenue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, props: enrichedProps })
      }).catch(() => {});
    }
  } catch {}
}

// Convenience functions for common PRO events
export function trackProGateViewed(
  feature: string, 
  location: string,
  options?: {
    plan_suggested?: string;
    reason?: string;
  }
) {
  captureProEvent('pro_gate_viewed', { 
    feature, 
    gate_location: location,
    location, // Alias for consistency
    plan_suggested: options?.plan_suggested || 'monthly',
    reason: options?.reason || 'feature_required',
  });
}

export function trackProGateClicked(
  feature: string, 
  location: string,
  options?: {
    plan_suggested?: string;
    reason?: string;
  }
) {
  captureProEvent('pro_gate_clicked', { 
    feature, 
    gate_location: location,
    location, // Alias for consistency
    plan_suggested: options?.plan_suggested || 'monthly',
    reason: options?.reason || 'feature_required',
  });
}

export function trackProUpgradeStarted(
  source: 'gate' | 'pricing', 
  options?: {
    feature?: string;
    location?: string;
  }
) {
  captureProEvent('pro_upgrade_started', { 
    upgrade_source: source,
    feature: options?.feature,
    gate_location: options?.location,
    location: options?.location,
  });
}

export function trackProFeatureUsed(feature: string) {
  captureProEvent('pro_feature_used', { feature });
}