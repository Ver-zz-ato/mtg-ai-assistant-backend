'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type LandingRow = { initial_pathname: string; ai_requests: number; unique_users: number; total_cost: number };
type ReferrerRow = { initial_referrer_domain: string; ai_requests: number; unique_users: number };
type RepeatRow = { initial_pathname: string; repeat_users: number };
type CommanderRow = { initial_pathname: string; ai_requests: number; unique_users: number };

export default function AdminAttributionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [landingPages, setLandingPages] = useState<LandingRow[]>([]);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [repeatUsage, setRepeatUsage] = useState<RepeatRow[]>([]);
  const [commanderFunnel, setCommanderFunnel] = useState<CommanderRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/attribution/funnel', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
        setLandingPages(data.landingPages || []);
        setReferrers(data.referrers || []);
        setRepeatUsage(data.repeatUsage || []);
        setCommanderFunnel(data.commanderFunnel || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6 flex items-center justify-center">
        <div className="text-neutral-400">Loading attribution data...</div>
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
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <Link href="/admin/JustForDavy" className="text-sm text-neutral-500 hover:text-neutral-300 mb-2 inline-block">
              ← Back to Admin
            </Link>
            <h1 className="text-2xl font-semibold">Attribution & Funnels</h1>
            <p className="text-sm text-neutral-500 mt-1">
              First-touch attribution: which landing pages and referrers lead to AI usage.
            </p>
          </div>
        </header>

        <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="font-medium text-neutral-300 mb-2">Top landing pages leading to AI usage</div>
          <p className="text-xs text-neutral-500 mb-3">Initial pathname where users first landed, joined with ai_usage (last 90 days)</p>
          {landingPages.length === 0 ? (
            <div className="text-sm text-neutral-500">No data yet. Attribution records on first visit.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-left">
                  <th className="py-2 pr-4">Pathname</th>
                  <th className="py-2 pr-4 text-right">AI requests</th>
                  <th className="py-2 pr-4 text-right">Unique users</th>
                  <th className="py-2 pr-4 text-right">Total cost ($)</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((r) => (
                  <tr key={r.initial_pathname} className="border-b border-neutral-800">
                    <td className="py-2 pr-4 font-mono text-neutral-300">{r.initial_pathname}</td>
                    <td className="py-2 pr-4 text-right">{r.ai_requests}</td>
                    <td className="py-2 pr-4 text-right">{r.unique_users}</td>
                    <td className="py-2 pr-4 text-right">{r.total_cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="font-medium text-neutral-300 mb-2">Top referrer domains leading to AI usage</div>
          <p className="text-xs text-neutral-500 mb-3">Where users came from (domain only, not full URL)</p>
          {referrers.length === 0 ? (
            <div className="text-sm text-neutral-500">No data yet.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-left">
                  <th className="py-2 pr-4">Referrer domain</th>
                  <th className="py-2 pr-4 text-right">AI requests</th>
                  <th className="py-2 pr-4 text-right">Unique users</th>
                </tr>
              </thead>
              <tbody>
                {referrers.map((r) => (
                  <tr key={r.initial_referrer_domain} className="border-b border-neutral-800">
                    <td className="py-2 pr-4 font-mono text-neutral-300">{r.initial_referrer_domain}</td>
                    <td className="py-2 pr-4 text-right">{r.ai_requests}</td>
                    <td className="py-2 pr-4 text-right">{r.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="font-medium text-neutral-300 mb-2">Repeat usage funnel</div>
          <p className="text-xs text-neutral-500 mb-3">Users with 2+ AI requests, grouped by initial landing page</p>
          {repeatUsage.length === 0 ? (
            <div className="text-sm text-neutral-500">No repeat users yet.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-left">
                  <th className="py-2 pr-4">Pathname</th>
                  <th className="py-2 pr-4 text-right">Repeat users</th>
                </tr>
              </thead>
              <tbody>
                {repeatUsage.map((r) => (
                  <tr key={r.initial_pathname} className="border-b border-neutral-800">
                    <td className="py-2 pr-4 font-mono text-neutral-300">{r.initial_pathname}</td>
                    <td className="py-2 pr-4 text-right">{r.repeat_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="font-medium text-neutral-300 mb-2">Commander funnel</div>
          <p className="text-xs text-neutral-500 mb-3">Landing pages under /commanders/ that lead to AI usage</p>
          {commanderFunnel.length === 0 ? (
            <div className="text-sm text-neutral-500">No commander landing data yet.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 text-left">
                  <th className="py-2 pr-4">Pathname</th>
                  <th className="py-2 pr-4 text-right">AI requests</th>
                  <th className="py-2 pr-4 text-right">Unique users</th>
                </tr>
              </thead>
              <tbody>
                {commanderFunnel.map((r) => (
                  <tr key={r.initial_pathname} className="border-b border-neutral-800">
                    <td className="py-2 pr-4 font-mono text-neutral-300">{r.initial_pathname}</td>
                    <td className="py-2 pr-4 text-right">{r.ai_requests}</td>
                    <td className="py-2 pr-4 text-right">{r.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
