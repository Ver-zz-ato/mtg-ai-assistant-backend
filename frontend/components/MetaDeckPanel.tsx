"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  costAuditClientLog,
  costAuditRequestId,
  isCostAuditClientEnabled,
} from "@/lib/observability/cost-audit";
import { formatMetaFreshnessPill, type MetaLabelPayload } from "@/lib/meta/freshness";
import { fetchJson } from "@/lib/http";

interface MetaCommanderRow {
  name: string;
  count: number;
  slug?: string;
}

interface MetaData {
  topCommanders: MetaCommanderRow[];
  trendingCommanders?: MetaCommanderRow[];
  mostPlayedCommanders?: MetaCommanderRow[];
  popularCards: Array<{ name: string; count: number }>;
  formatDistribution: Record<string, number>;
  totalDecks: number;
  lastUpdated: string | null;
  labelPayload?: MetaLabelPayload | null;
}

export default function MetaDeckPanel() {
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeoutId = setTimeout(fetchMeta, 800);
    return () => clearTimeout(timeoutId);
  }, []);

  async function fetchMeta() {
    const session = isCostAuditClientEnabled() ? costAuditRequestId() : "";
    const t0 = Date.now();
    if (isCostAuditClientEnabled()) {
      costAuditClientLog({
        event: "client.meta.trending_start",
        component: "MetaDeckPanel",
        session,
        path: "/api/meta/trending",
      });
    }
    try {
      const data = await fetchJson<MetaData & { ok?: boolean }>("/api/meta/trending", {
        cache: "no-store",
      });
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: "client.meta.trending_done",
          component: "MetaDeckPanel",
          session,
          durationMs: Date.now() - t0,
          ok: !!data?.ok,
          status: 200,
          hasMeta: !!data?.ok,
        });
      }

      if (data.ok) {
        setMeta(data);
      }
    } catch {
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: "client.meta.trending_done",
          component: "MetaDeckPanel",
          session,
          durationMs: Date.now() - t0,
          ok: false,
          err: "exception",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-2xl border border-purple-800/30 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-purple-800/30 rounded w-1/2" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-purple-800/30 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!meta) {
    return null;
  }

  const freshness = formatMetaFreshnessPill(meta.lastUpdated, meta.labelPayload ?? null);
  const trending = (meta.trendingCommanders ?? []).slice(0, 3);
  const mostPlayed = (meta.mostPlayedCommanders ?? meta.topCommanders ?? []).slice(0, 5);

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-2xl border border-purple-800/30 p-4 hover:border-purple-700/50 transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-purple-400">Meta Snapshot</h3>
          {freshness ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-purple-500/30 bg-black/25 px-2.5 py-1 text-[11px] font-medium text-purple-200/90">
              {freshness}
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-black/30 rounded-lg p-3 mb-4 border border-purple-700/20">
        <div className="text-sm text-gray-400 text-center">Public Decks</div>
        <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent text-center">
          {meta.totalDecks.toLocaleString()}
        </div>
      </div>

      {trending.length > 0 ? (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">
            <Link href="/meta/trending-commanders" className="hover:text-purple-400 transition-colors">
              Trending now
            </Link>
          </h4>
          <div className="space-y-1">
            {trending.map((cmd, i) => (
              <Link
                key={`trending-${cmd.name}`}
                href={cmd.slug ? `/commanders/${cmd.slug}` : `/decks/browse?search=${encodeURIComponent(cmd.name)}`}
                className="flex items-center justify-between text-sm hover:bg-purple-900/20 rounded px-2 py-1 transition-colors duration-150 group"
              >
                <span className="text-gray-300 truncate flex-1 group-hover:text-white">
                  <span className="text-fuchsia-300 font-semibold mr-2">{i + 1}.</span>
                  {cmd.name}
                </span>
                <span className="text-gray-500 text-xs ml-2">{cmd.count} new</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">
          <Link href="/meta/most-played-commanders" className="hover:text-purple-400 transition-colors">
            Most played
          </Link>
        </h4>
        {mostPlayed.length > 0 ? (
          <div className="space-y-1">
            {mostPlayed.map((cmd, i) => (
              <Link
                key={`popular-${cmd.name}`}
                href={cmd.slug ? `/commanders/${cmd.slug}` : `/decks/browse?search=${encodeURIComponent(cmd.name)}`}
                className="flex items-center justify-between text-sm hover:bg-purple-900/20 rounded px-2 py-1 transition-colors duration-150 group"
              >
                <span className="text-gray-300 truncate flex-1 group-hover:text-white">
                  <span className="text-purple-400 font-semibold mr-2">{i + 1}.</span>
                  {cmd.name}
                </span>
                <span className="text-gray-500 text-xs ml-2">{cmd.count} decks</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 italic">No commanders yet. Create public decks to see trends.</div>
        )}
      </div>

      <Link
        href="/meta"
        className="group block rounded-xl border-2 border-purple-500/60 bg-gradient-to-br from-purple-900/40 via-purple-800/30 to-blue-900/40 p-4 hover:border-purple-400 hover:from-purple-800/50 hover:to-blue-800/50 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-200 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="font-bold text-purple-200 group-hover:text-purple-100 transition-colors">
              Stay ahead of the commander meta
            </div>
            <div className="text-xs text-gray-400 mt-0.5 group-hover:text-gray-300 transition-colors">
              Live trending commanders, cards, and budget builds
            </div>
          </div>
          <span className="ml-auto text-purple-400 group-hover:translate-x-1 transition-transform">→</span>
        </div>
      </Link>
    </div>
  );
}
