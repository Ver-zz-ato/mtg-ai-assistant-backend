"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";

export type MarketingSourceHealthRow = {
  id: string;
  type: string;
  name: string;
  url: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
  fetch_error: string | null;
};

type Props = {
  sources: MarketingSourceHealthRow[];
  youtubeConfigured: boolean;
  redditConfigured: boolean;
  redditPartial: boolean;
};

export function SetupTab({
  sources,
  youtubeConfigured,
  redditConfigured,
  redditPartial,
}: Props) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, MarketingSourceHealthRow[]>();
    for (const s of sources) {
      const key = s.type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sources]);

  return (
    <div className="space-y-5">
      <ELI5
        heading="Environment & sources"
        items={[
          "YouTube needs YOUTUBE_API_KEY in Vercel (you already added this).",
          "Reddit needs a script app plus four env vars — see below. Reddit broke anonymous reads in 2025+.",
          "RSS sources are edited in Supabase marketing_sources if a feed moves or 404s.",
        ]}
      />

      <section className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 space-y-3">
        <div className="font-medium text-amber-100">Reddit setup (script app)</div>
        <p className="text-sm text-neutral-300">
          Reddit&apos;s new developer portal asks for an <strong>automated account</strong>. Use your
          Reddit <strong>username</strong> (not email) — 3+ characters, letters/numbers/underscore/hyphen
          only. Example: <code className="text-amber-200">manatap_radar</code>, not an email address.
        </p>
        <ol className="list-decimal pl-5 text-sm text-neutral-400 space-y-1">
          <li>
            Create app at{" "}
            <a
              href="https://www.reddit.com/prefs/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline"
            >
              reddit.com/prefs/apps
            </a>{" "}
            (type: <strong>script</strong>) or the new{" "}
            <a
              href="https://developers.reddit.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline"
            >
              developers.reddit.com
            </a>{" "}
            flow.
          </li>
          <li>Copy client ID (under app name) and secret.</li>
          <li>
            Add to Vercel env: <code className="text-xs">REDDIT_CLIENT_ID</code>,{" "}
            <code className="text-xs">REDDIT_CLIENT_SECRET</code>,{" "}
            <code className="text-xs">REDDIT_USERNAME</code>,{" "}
            <code className="text-xs">REDDIT_PASSWORD</code> (dedicated bot account password).
          </li>
          <li>Redeploy. Amber banner on Collect tab should disappear.</li>
        </ol>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`px-2 py-1 rounded border ${
              redditConfigured
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                : "border-neutral-600 text-neutral-400"
            }`}
          >
            Reddit: {redditConfigured ? "ready" : redditPartial ? "incomplete env" : "not configured"}
          </span>
          <span
            className={`px-2 py-1 rounded border ${
              youtubeConfigured
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                : "border-neutral-600 text-neutral-400"
            }`}
          >
            YouTube: {youtubeConfigured ? "ready" : "not configured"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-4">
        <div className="font-medium">Source health</div>
        <p className="text-sm text-neutral-500">
          Last fetch time and errors per feed. Fix URLs or channel IDs in Supabase if something stays red.
        </p>
        {[...grouped.entries()].map(([type, rows]) => (
          <div key={type}>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{type}</div>
            <ul className="space-y-2">
              {rows.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"
                >
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className={s.enabled ? "text-neutral-200" : "text-neutral-500 line-through"}>
                      {s.name}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {s.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  {s.fetch_error && (
                    <p className="text-xs text-red-300/90 mt-1">Error: {s.fetch_error}</p>
                  )}
                  {s.last_fetched_at && !s.fetch_error && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Last OK: {new Date(s.last_fetched_at).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!sources.length && <p className="text-sm text-neutral-500">No sources loaded.</p>}
      </section>

      <p className="text-xs text-neutral-500 border border-neutral-800 rounded p-3">
        Safety: Marketing Radar only <strong>reads</strong> external sites. Drafts are never auto-posted.
        Reddit drafts need extra human review before you copy them.
      </p>
    </div>
  );
}
