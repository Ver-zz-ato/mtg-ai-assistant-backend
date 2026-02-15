'use client';

import React, { useState, useEffect } from 'react';
import { getConsentStatus } from '@/lib/consent';
import { getVisitorIdFromCookie, getDistinctId } from '@/lib/ph';
import { getLastEvents, clearCaptureBuffer } from '@/lib/analytics/capture-buffer';
import Link from 'next/link';

function isPostHogLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).posthog?._loaded;
}

export default function AnalyticsDebugPage() {
  const [consent, setConsent] = useState<string>('unknown');
  const [phLoaded, setPhLoaded] = useState(false);
  const [distinctId, setDistinctId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ event: string; props: Record<string, unknown>; ts: string }>>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setConsent(getConsentStatus());
    setPhLoaded(isPostHogLoaded());
    setDistinctId(getDistinctId());
    setVisitorId(getVisitorIdFromCookie());
    setEvents(getLastEvents(20));
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics Debug</h1>
          <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
            ← Admin
          </Link>
        </div>

        <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">Consent</span>
            <span className="font-mono">{consent}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">PostHog loaded</span>
            <span className="font-mono">{phLoaded ? 'yes' : 'no'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">distinct_id</span>
            <span className="font-mono text-sm truncate max-w-[240px]" title={distinctId ?? ''}>
              {distinctId ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-400">visitor_id (cookie)</span>
            <span className="font-mono text-sm truncate max-w-[240px]" title={visitorId ?? ''}>
              {visitorId ?? '—'}
            </span>
          </div>
          <div className="pt-2">
            <button
              onClick={() => {
                clearCaptureBuffer();
                refresh();
              }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear event buffer
            </button>
            <button onClick={refresh} className="ml-4 text-xs text-blue-400 hover:text-blue-300">
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-700 bg-neutral-900/50">
          <div className="p-3 border-b border-neutral-700 flex items-center justify-between">
            <span className="font-medium">Last {events.length} events (capture buffer)</span>
            <button onClick={refresh} className="text-xs text-neutral-400 hover:text-white">
              Refresh
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto p-3 font-mono text-xs space-y-2">
            {events.length === 0 ? (
              <div className="text-neutral-500 italic">No events yet. Trigger some capture() calls.</div>
            ) : (
              events.map((e, i) => (
                <div key={i} className="rounded bg-neutral-800/80 p-2 border border-neutral-700/50">
                  <div className="text-amber-300">{e.event}</div>
                  <div className="text-neutral-500 mt-0.5">{e.ts}</div>
                  <pre className="mt-1 text-neutral-400 whitespace-pre-wrap break-all">
                    {JSON.stringify(e.props, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Server-side events (e.g. user_first_visit, pageview_server, auth-event) are not in this buffer.
          Check PostHog live events or logs to verify them.
        </p>
      </div>
    </div>
  );
}
