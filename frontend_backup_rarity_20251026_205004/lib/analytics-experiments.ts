// lib/analytics-experiments.ts
// Feature flag and experimentation analytics

import { capture } from './ph';

export type ExperimentEventType =
  | 'experiment.assigned'     // User assigned to experiment variant
  | 'experiment.converted'    // User converted on experiment goal
  | 'feature.enabled'         // Feature flag enabled for user
  | 'feature.used'            // User interacted with flagged feature

export interface ExperimentEventProps {
  experiment_name: string;     // Name of the experiment
  variant: string;            // Which variant user is in
  feature_flag?: string;      // Associated feature flag name
  conversion_goal?: string;   // What conversion goal was met
  conversion_value?: number;  // Value of conversion (revenue, etc.)
}

export function trackExperimentEvent(event: ExperimentEventType, props: ExperimentEventProps) {
  try {
    const enrichedProps = {
      ...props,
      event_category: 'experiment',
      timestamp: new Date().toISOString(),
    };
    
    capture(event, enrichedProps);
  } catch {}
}

// Track when user is assigned to experiment variant
export function trackExperimentAssignment(experimentName: string, variant: string, featureFlag?: string) {
  trackExperimentEvent('experiment.assigned', {
    experiment_name: experimentName,
    variant,
    feature_flag: featureFlag
  });
}

// Track when user converts on experiment goal
export function trackExperimentConversion(
  experimentName: string, 
  variant: string, 
  goal: string, 
  value?: number
) {
  trackExperimentEvent('experiment.converted', {
    experiment_name: experimentName,
    variant,
    conversion_goal: goal,
    conversion_value: value
  });
}

// Track feature flag usage
export function trackFeatureFlag(flagName: string, enabled: boolean, context?: Record<string, any>) {
  const event = enabled ? 'feature.enabled' : 'feature.used';
  
  capture(event, {
    feature_flag: flagName,
    flag_enabled: enabled,
    event_category: 'feature_flag',
    ...context
  });
}

// Integration with your existing flags system
export function withExperimentTracking<T extends Record<string, any>>(
  flags: T,
  userId?: string
): T {
  // Track all active feature flags for this user
  Object.entries(flags).forEach(([flagName, value]) => {
    if (value !== false && value !== null && value !== undefined) {
      trackFeatureFlag(flagName, true, { 
        flag_value: value,
        user_id: userId 
      });
    }
  });
  
  return flags;
}