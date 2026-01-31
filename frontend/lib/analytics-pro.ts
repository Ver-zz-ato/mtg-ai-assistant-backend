// lib/analytics-pro.ts
// Enhanced analytics for PRO feature funnel tracking (PostHog-aligned)

import { capture } from './ph';
import { setActiveWorkflow, getCurrentWorkflowRunId } from './analytics/workflow-abandon';
import { getCurrentPath } from './analytics/session-bootstrap';
import { getVisitorIdFromCookie } from './ph';

const ACTIVE_PRO_FEATURE_KEY = 'analytics:active_pro_feature';

let activeProFeatureMemory: string | null = null;

/** Store the current pro_feature so upgrade_started/completed can attribute to the gate that triggered the paywall. */
export function setActiveProFeature(feature: string): void {
  activeProFeatureMemory = feature;
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_PRO_FEATURE_KEY, feature);
  } catch {}
}

/** Read the stored pro_feature (memory first, then localStorage). */
export function getActiveProFeature(): string | null {
  if (activeProFeatureMemory) return activeProFeatureMemory;
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(ACTIVE_PRO_FEATURE_KEY);
      if (stored) return stored;
    }
  } catch {}
  return null;
}

export type ProEventType =
  | 'pro_gate_viewed'
  | 'pro_gate_clicked'
  | 'pro_upgrade_started'
  | 'pro_upgrade_completed'
  | 'pro_feature_used'
  | 'pro_downgrade';

export interface ProEventProps {
  pro_feature?: string;       // Required for gate/start/completed attribution
  feature?: string;           // Legacy alias
  source_path?: string;       // Pathname at time of event
  gate_location?: string;
  location?: string;
  plan_suggested?: string;
  reason?: string;
  subscription_tier?: string;
  upgrade_source?: string;
  user_tenure_days?: number;
  workflow_run_id?: string;
  is_logged_in?: boolean;
  is_pro?: boolean;
  visitor_id?: string | null;
}

export function captureProEvent(event: ProEventType, props?: ProEventProps) {
  try {
    const base = {
      ...props,
      event_category: 'pro_funnel',
      timestamp: new Date().toISOString(),
    };

    if (event === 'pro_upgrade_completed') {
      const proFeature = props?.pro_feature ?? props?.feature ?? getActiveProFeature() ?? undefined;
      const sourcePath = props?.source_path ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined);
      const runId = getCurrentWorkflowRunId();
      const enrichedProps = {
        ...base,
        pro_feature: proFeature,
        source_path: sourcePath,
        workflow_run_id: props?.workflow_run_id ?? runId ?? undefined,
      };
      capture(event, enrichedProps);
      fetch('/api/analytics/track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, properties: enrichedProps }),
      }).catch(() => {});
      return;
    }

    capture(event, base);
  } catch {}
}

export function trackProGateViewed(
  feature: string,
  location: string,
  options?: {
    plan_suggested?: string;
    reason?: string;
    is_logged_in?: boolean;
    is_pro?: boolean;
  }
) {
  setActiveProFeature(feature);
  const sourcePath = typeof window !== 'undefined' ? getCurrentPath() : undefined;
  const visitorId = getVisitorIdFromCookie();
  captureProEvent('pro_gate_viewed', {
    pro_feature: feature,
    feature,
    gate_location: location,
    location,
    source_path: sourcePath,
    is_logged_in: options?.is_logged_in,
    is_pro: options?.is_pro,
    visitor_id: visitorId ?? undefined,
    plan_suggested: options?.plan_suggested || 'monthly',
    reason: options?.reason || 'feature_required',
  });
}

export function trackProGateClicked(
  feature: string,
  location: string,
  options?: { plan_suggested?: string; reason?: string }
) {
  captureProEvent('pro_gate_clicked', {
    pro_feature: feature,
    feature,
    gate_location: location,
    location,
    source_path: typeof window !== 'undefined' ? getCurrentPath() : undefined,
    plan_suggested: options?.plan_suggested || 'monthly',
    reason: options?.reason || 'feature_required',
  });
}

export function trackProUpgradeStarted(
  source: 'gate' | 'pricing',
  options?: { feature?: string; location?: string }
) {
  const runId = setActiveWorkflow('pro_upgrade');
  const proFeature = getActiveProFeature() ?? options?.feature ?? undefined;
  const sourcePath = typeof window !== 'undefined' ? getCurrentPath() : undefined;
  captureProEvent('pro_upgrade_started', {
    pro_feature: proFeature,
    feature: options?.feature,
    gate_location: options?.location,
    location: options?.location,
    source_path: sourcePath,
    upgrade_source: source,
    workflow_run_id: runId,
  });
}

export function trackProFeatureUsed(feature: string) {
  captureProEvent('pro_feature_used', { pro_feature: feature, feature });
}
