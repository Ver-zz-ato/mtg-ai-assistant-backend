'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type TimeRange = '24h' | '7d' | '30d' | '90d';

type FunnelData = {
  viewers: number;
  clickers: number;
  starters: number;
  converters: number;
  clickRate: string;
  conversionRate: string;
};

type FeatureRow = {
  feature: string;
  views: number;
  clicks: number;
  started: number;
  completed: number;
};

type PathRow = {
  path: string;
  views: number;
  clicks: number;
};

type EventRow = {
  id: number;
  event_type: string;
  pro_feature: string | null;
  gate_location: string | null;
  source_path: string | null;
  is_logged_in: boolean | null;
  is_pro: boolean | null;
  visitor_id: string | null;
  user_id: string | null;
  created_at: string;
};

export default function ProGateAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>('7d');
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [byFeature, setByFeature] = useState<FeatureRow[]>([]);
  const [byPath, setByPath] = useState<PathRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    loadData();
  }, [range]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pro-gate-analytics?range=${range}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      setFunnel(data.funnel);
      setByFeature(data.byFeature || []);
      setByPath(data.byPath || []);
      setRecentEvents(data.recentEvents || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  const eventTypeColors: Record<string, string> = {
    pro_gate_viewed: 'bg-blue-500/20 text-blue-300',
    pro_gate_clicked: 'bg-yellow-500/20 text-yellow-300',
    pro_upgrade_started: 'bg-purple-500/20 text-purple-300',
    pro_upgrade_completed: 'bg-green-500/20 text-green-300',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6 flex items-center justify-center">
        <div className="text-neutral-400">Loading pro gate analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6 flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Link href="/admin/justfordavy" className="text-sm text-neutral-500 hover:text-neutral-300 mb-2 inline-block">
              &larr; Back to Admin
            </Link>
            <h1 className="text-2xl font-semibold">Pro Gate Analytics</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Track where users see the Pro paywall and conversion funnel
            </p>
          </div>
          <div className="flex gap-2">
            {(['24h', '7d', '30d', '90d'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  range === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </header>

        {/* Funnel Overview */}
        {funnel && (
          <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
            <div className="font-medium text-neutral-300 mb-4">Conversion Funnel</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-blue-400">{funnel.viewers}</div>
                <div className="text-sm text-neutral-400">Gate Views</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-yellow-400">{funnel.clickers}</div>
                <div className="text-sm text-neutral-400">Clicked Upgrade</div>
                <div className="text-xs text-neutral-500">{funnel.clickRate}% of viewers</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-purple-400">{funnel.starters}</div>
                <div className="text-sm text-neutral-400">Started Checkout</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-400">{funnel.converters}</div>
                <div className="text-sm text-neutral-400">Converted to Pro</div>
                <div className="text-xs text-neutral-500">{funnel.conversionRate}% conversion</div>
              </div>
            </div>
          </div>
        )}

        {/* Two column layout for feature and path breakdowns */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* By Feature */}
          <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
            <div className="font-medium text-neutral-300 mb-2">By Feature</div>
            <p className="text-xs text-neutral-500 mb-3">Which Pro features trigger the most gates</p>
            {byFeature.length === 0 ? (
              <div className="text-sm text-neutral-500">No data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-700 text-left">
                      <th className="py-2 pr-3">Feature</th>
                      <th className="py-2 pr-3 text-right">Views</th>
                      <th className="py-2 pr-3 text-right">Clicks</th>
                      <th className="py-2 text-right">Conv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byFeature.map((r) => (
                      <tr key={r.feature} className="border-b border-neutral-800">
                        <td className="py-2 pr-3 font-mono text-xs text-neutral-300">{r.feature}</td>
                        <td className="py-2 pr-3 text-right text-blue-400">{r.views}</td>
                        <td className="py-2 pr-3 text-right text-yellow-400">{r.clicks}</td>
                        <td className="py-2 text-right text-green-400">{r.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* By Path */}
          <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
            <div className="font-medium text-neutral-300 mb-2">By Page</div>
            <p className="text-xs text-neutral-500 mb-3">Which pages show the most Pro gates</p>
            {byPath.length === 0 ? (
              <div className="text-sm text-neutral-500">No data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-700 text-left">
                      <th className="py-2 pr-3">Path</th>
                      <th className="py-2 pr-3 text-right">Views</th>
                      <th className="py-2 text-right">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPath.map((r) => (
                      <tr key={r.path} className="border-b border-neutral-800">
                        <td className="py-2 pr-3 font-mono text-xs text-neutral-300 max-w-[200px] truncate" title={r.path}>
                          {r.path}
                        </td>
                        <td className="py-2 pr-3 text-right text-blue-400">{r.views}</td>
                        <td className="py-2 text-right text-yellow-400">{r.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Recent Events */}
        <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="font-medium text-neutral-300 mb-2">Recent Events</div>
          <p className="text-xs text-neutral-500 mb-3">Last 100 pro gate events</p>
          {recentEvents.length === 0 ? (
            <div className="text-sm text-neutral-500">No events yet. Pro gate events will appear here when users encounter the Pro paywall.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-700 text-left">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Event</th>
                    <th className="py-2 pr-3">Feature</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Path</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((e) => (
                    <tr key={e.id} className="border-b border-neutral-800 hover:bg-neutral-800/30">
                      <td className="py-2 pr-3 text-neutral-400 whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${eventTypeColors[e.event_type] || 'bg-neutral-700'}`}>
                          {e.event_type.replace('pro_', '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-neutral-300">{e.pro_feature || '-'}</td>
                      <td className="py-2 pr-3 text-neutral-400">{e.gate_location || '-'}</td>
                      <td className="py-2 pr-3 font-mono text-neutral-400 max-w-[150px] truncate" title={e.source_path || ''}>
                        {e.source_path || '-'}
                      </td>
                      <td className="py-2 pr-3 font-mono text-neutral-500">
                        {e.user_id || e.visitor_id || 'anon'}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          {e.is_logged_in && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-xs">logged in</span>
                          )}
                          {e.is_pro && (
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">pro</span>
                          )}
                          {!e.is_logged_in && !e.is_pro && (
                            <span className="px-1.5 py-0.5 bg-neutral-700 text-neutral-400 rounded text-xs">guest</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="text-xs text-neutral-500 space-y-1">
          <p><strong>Gate View</strong> = User sees the Pro paywall/upgrade prompt</p>
          <p><strong>Click</strong> = User clicks the upgrade button on the gate</p>
          <p><strong>Started</strong> = User begins checkout process</p>
          <p><strong>Completed</strong> = User successfully converts to Pro</p>
        </div>
      </div>
    </div>
  );
}
