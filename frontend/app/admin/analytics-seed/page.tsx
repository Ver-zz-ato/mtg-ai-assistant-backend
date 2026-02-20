'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { captureProEvent, trackProGateViewed, trackProUpgradeStarted, setActiveProFeature } from '@/lib/analytics-pro';
import { trackWorkflowEvent } from '@/lib/analytics-workflow';

const SEED_RUN_ID = `seed_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

export default function AnalyticsSeedPage() {
  const [lastFired, setLastFired] = useState<string | null>(null);

  const fire = (label: string, fn: () => void) => {
    fn();
    setLastFired(label);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics event seeding</h1>
          <Link href="/admin/justfordavy" className="text-sm text-neutral-400 hover:text-white">
            ← Admin
          </Link>
        </div>
        <p className="text-sm text-neutral-400">
          Fire each canonical event once so PostHog taxonomy picks them up. Admin-only. Safe to remove later.
        </p>
        {lastFired && (
          <div className="rounded-lg border border-green-700/50 bg-green-900/20 px-3 py-2 text-sm text-green-300">
            Fired: {lastFired}
          </div>
        )}

        <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 space-y-3">
          <h2 className="font-semibold text-neutral-200">Pro funnel</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fire('pro_gate_viewed', () => {
                setActiveProFeature('seed_test');
                trackProGateViewed('seed_test', 'admin_seed', { is_pro: false });
              })}
              className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              pro_gate_viewed
            </button>
            <button
              type="button"
              onClick={() => fire('pro_upgrade_started', () => {
                setActiveProFeature('seed_test');
                trackProUpgradeStarted('gate', { feature: 'seed_test', location: 'admin_seed' });
              })}
              className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              pro_upgrade_started
            </button>
            <button
              type="button"
              onClick={() => fire('pro_upgrade_completed', () => {
                setActiveProFeature('seed_test');
                captureProEvent('pro_upgrade_completed', {
                  pro_feature: 'seed_test',
                  source_path: '/admin/analytics-seed',
                  workflow_run_id: SEED_RUN_ID,
                });
              })}
              className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              pro_upgrade_completed
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 space-y-3">
          <h2 className="font-semibold text-neutral-200">Workflow</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fire('workflow.started', () => {
                trackWorkflowEvent('workflow.started', {
                  workflow_name: 'seed_test',
                  workflow_run_id: SEED_RUN_ID,
                  step_name: 'started',
                  current_step: 1,
                  total_steps: 1,
                });
              })}
              className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              workflow.started
            </button>
            <button
              type="button"
              onClick={() => fire('workflow.completed', () => {
                trackWorkflowEvent('workflow.completed', {
                  workflow_name: 'seed_test',
                  workflow_run_id: SEED_RUN_ID,
                  step_name: 'completed',
                  current_step: 1,
                  total_steps: 1,
                });
              })}
              className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              workflow.completed
            </button>
            <button
              type="button"
              onClick={() => fire('workflow.abandoned', () => {
                trackWorkflowEvent('workflow.abandoned', {
                  workflow_name: 'seed_test',
                  workflow_run_id: SEED_RUN_ID,
                  step_name: 'abandoned',
                  current_step: 1,
                  abandon_reason: 'seed_test',
                });
              })}
              className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              workflow.abandoned
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 space-y-2">
          <h2 className="font-semibold text-neutral-200">Auth (signup_completed / login_completed)</h2>
          <p className="text-sm text-neutral-400">
            Do not fake auth events. To seed: sign out, open signup modal, then sign in or create account. Events fire via <code className="text-neutral-300">/api/analytics/auth-event</code> on SIGNED_IN.
          </p>
          <Link href="/" className="inline-block text-sm text-blue-400 hover:text-blue-300">
            Go to app → open Sign in / Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
