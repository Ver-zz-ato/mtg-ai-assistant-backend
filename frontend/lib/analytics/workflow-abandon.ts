'use client';

import { capture } from '@/lib/ph';
import { getSessionId } from './workflow-session';

export type WorkflowName = 'deck_create' | 'deck_analyze' | 'pro_upgrade';

let activeWorkflow: {
  name: WorkflowName;
  step?: number;
  startedAt: number;
  runId: string;
} | null = null;

export function setActiveWorkflow(name: WorkflowName, step?: number): string {
  const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any);
  const cr = (g as any).crypto;
  const runId =
    cr && typeof cr.randomUUID === 'function' ? cr.randomUUID() : `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  activeWorkflow = { name, step, startedAt: Date.now(), runId };
  return runId;
}

export function clearActiveWorkflow(): void {
  activeWorkflow = null;
}

export function getActiveWorkflow(): WorkflowName | null {
  return activeWorkflow?.name ?? null;
}

export function getCurrentWorkflowRunId(): string | null {
  return activeWorkflow?.runId ?? null;
}

export function fireWorkflowAbandoned(): void {
  const w = activeWorkflow;
  if (!w) return;
  const runId = w.runId;
  clearActiveWorkflow();
  try {
    capture('workflow.abandoned', {
      workflow_name: w.name,
      workflow_run_id: runId,
      current_step: w.step ?? 1,
      step_name: 'abandoned',
      abandon_reason: 'navigation_away',
      time_spent_seconds: Math.round((Date.now() - w.startedAt) / 1000),
      session_id: getSessionId(),
      event_category: 'workflow',
      timestamp: new Date().toISOString(),
    });
  } catch {}
}

let listenersAttached = false;

export function attachWorkflowAbandonListeners(): void {
  if (typeof window === 'undefined' || listenersAttached) return;
  listenersAttached = true;

  window.addEventListener('beforeunload', fireWorkflowAbandoned);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') fireWorkflowAbandoned();
  });
}
