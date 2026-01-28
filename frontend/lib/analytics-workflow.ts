// lib/analytics-workflow.ts
// User workflow and journey analytics

import { capture } from './ph';

export type WorkflowEventType =
  | 'workflow.started'
  | 'workflow.step_completed' 
  | 'workflow.abandoned'
  | 'workflow.completed';

export interface WorkflowEventProps {
  workflow_name: string;      // 'deck_creation', 'collection_import', etc.
  workflow_run_id?: string;   // UUID for this run; links started/step/completed/abandoned in PostHog
  step_name?: string;         // Current step in workflow
  total_steps?: number;       // Total steps in workflow
  current_step?: number;      // Current step number
  time_spent_seconds?: number;// Time spent on this step
  abandon_reason?: string;    // Why workflow was abandoned
  completion_rate?: number;   // 0-1 for partial completion
}

export function trackWorkflowEvent(event: WorkflowEventType, props: WorkflowEventProps) {
  try {
    const enrichedProps = {
      ...props,
      event_category: 'workflow',
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
    };
    
    capture(event, enrichedProps);
  } catch {}
}

// Session tracking for workflow continuity
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

// Convenience functions for common workflows
export function trackDeckCreationWorkflow(step: 'started' | 'format_selected' | 'cards_added' | 'saved' | 'abandoned', data?: any) {
  const stepMap = {
    started: { current_step: 1, step_name: 'deck_creation_started' },
    format_selected: { current_step: 2, step_name: 'format_selected' },
    cards_added: { current_step: 3, step_name: 'cards_added' },
    saved: { current_step: 4, step_name: 'deck_saved' },
    abandoned: { current_step: data?.current_step || 1, step_name: 'abandoned' }
  };
  
  const eventType = step === 'abandoned' ? 'workflow.abandoned' : 
                   step === 'saved' ? 'workflow.completed' : 'workflow.step_completed';
  
  trackWorkflowEvent(eventType, {
    workflow_name: 'deck_creation',
    total_steps: 4,
    ...stepMap[step],
    ...data
  });
}

export function trackCollectionImportWorkflow(step: 'started' | 'file_selected' | 'uploaded' | 'completed' | 'abandoned', data?: any) {
  const stepMap = {
    started: { current_step: 1, step_name: 'import_started' },
    file_selected: { current_step: 2, step_name: 'file_selected' },
    uploaded: { current_step: 3, step_name: 'file_uploaded' },
    completed: { current_step: 4, step_name: 'import_completed' },
    abandoned: { current_step: data?.current_step || 1, step_name: 'abandoned' }
  };
  
  const eventType = step === 'abandoned' ? 'workflow.abandoned' : 
                   step === 'completed' ? 'workflow.completed' : 'workflow.step_completed';
  
  trackWorkflowEvent(eventType, {
    workflow_name: 'collection_import',
    total_steps: 4,
    ...stepMap[step],
    ...data
  });
}