'use client';

import React from 'react';
import Link from 'next/link';

type HealthState = {
  openai_key_configured: boolean;
  runtime_flags: Record<string, boolean | undefined>;
  probe?: {
    ok: boolean;
    latency_ms?: number;
    error?: string;
    model_used?: string;
    fallback?: boolean;
  };
  ts?: string;
};

export default function AiHealthPage() {
  const [health, setHealth] = React.useState<HealthState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [probeLoading, setProbeLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (probe = false) => {
    try {
      setError(null);
      if (!probe) setLoading(true);
      const url = `/api/admin/ai/health${probe ? '?probe=1' : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.error || `HTTP ${res.status}`);
        if (!probe) setHealth(null);
        return;
      }
      setHealth({
        openai_key_configured: j.openai_key_configured ?? false,
        runtime_flags: j.runtime_flags ?? {},
        probe: j.probe,
        ts: j.ts,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      if (!probe) setHealth(null);
    } finally {
      setLoading(false);
      setProbeLoading(false);
    }
  }, []);

  React.useEffect(() => { load(false); }, []);

  async function runProbe() {
    setProbeLoading(true);
    await load(true);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">← Admin</Link>
        <h1 className="text-xl font-semibold">AI Health &amp; Test</h1>
      </div>
      <p className="text-sm text-neutral-400">
        Check why the chat shows &quot;AI service temporarily unavailable.&quot; Run a live probe to test the OpenAI API from this environment.
      </p>

      {loading && !health && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</div>}

      {health && (
        <>
          <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-neutral-200">Environment</h2>
            <ul className="text-sm space-y-1">
              <li className="flex items-center gap-2">
                <span className={health.openai_key_configured ? 'text-green-400' : 'text-amber-400'}>
                  {health.openai_key_configured ? '✓' : '✗'}
                </span>
                <span>OPENAI_API_KEY: {health.openai_key_configured ? 'configured' : 'not set'}</span>
              </li>
              {health.ts && <li className="text-neutral-500 text-xs">Last checked: {health.ts}</li>}
            </ul>
            {!health.openai_key_configured && (
              <p className="text-amber-200/90 text-sm mt-2">
                Chat will show &quot;temporarily unavailable&quot; and echo messages until OPENAI_API_KEY is set in this environment.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-neutral-200">Runtime flags (app_config)</h2>
            <ul className="text-sm text-neutral-300 space-y-1 font-mono">
              {Object.entries(health.runtime_flags).map(([k, v]) => (
                <li key={k}>{k}: {String(v)}</li>
              ))}
            </ul>
            {Object.keys(health.runtime_flags).length === 0 && (
              <p className="text-neutral-500 text-sm">No flags loaded (defaults apply).</p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-200">Live AI probe</h2>
            <p className="text-sm text-neutral-400">
              Sends a minimal request to the same OpenAI API the chat uses. Use this to see the real error when chat fails.
            </p>
            <button
              type="button"
              onClick={runProbe}
              disabled={probeLoading || !health.openai_key_configured}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
            >
              {probeLoading ? 'Testing…' : 'Run AI test'}
            </button>
            {health.probe !== undefined && (
              <div className={`rounded border p-3 text-sm ${health.probe.ok ? 'border-green-800 bg-green-950/20 text-green-200' : 'border-red-800 bg-red-950/20 text-red-200'}`}>
                {health.probe.ok ? (
                  <>
                    <div className="font-medium">Probe OK</div>
                    {health.probe.latency_ms != null && <div>Latency: {health.probe.latency_ms} ms</div>}
                    {health.probe.model_used && <div>Model: {health.probe.model_used}</div>}
                    {health.probe.fallback && <div className="text-amber-300">Used fallback model</div>}
                  </>
                ) : (
                  <>
                    <div className="font-medium">Probe failed</div>
                    {health.probe.error && <div className="mt-1">{health.probe.error}</div>}
                    {health.probe.latency_ms != null && <div className="text-neutral-400 text-xs">Took {health.probe.latency_ms} ms before failure</div>}
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
