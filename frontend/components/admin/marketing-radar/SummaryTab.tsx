"use client";

import React from "react";
import Link from "next/link";
import { ELI5, SectionCaption } from "@/components/AdminHelp";
import type { MarketingMetaSnapshot } from "@/lib/marketing/marketingBriefSchema";
import {
  appendMarketingUtm,
  buildCampaignSlug,
  type MarketingUtmPlatform,
} from "@/lib/marketing/marketingUtm";
import { BriefDetail } from "./BriefDetail";
import { BriefHistory } from "./BriefHistory";
import { SignalsList } from "./SignalsList";
import { CONTENT_FORMAT_LABELS, copyText, type BriefHistoryItem } from "./types";
import type { MarketingBriefRow, MarketingSignalRow } from "@/lib/marketing/marketingBriefSchema";

function MetaPanel({ meta }: { meta: MarketingMetaSnapshot | null }) {
  if (!meta) return null;
  const chip = (items: string[]) =>
    items.length ? (
      <div className="flex flex-wrap gap-1">
        {items.map((n) => (
          <span key={n} className="text-xs px-2 py-0.5 rounded-full border border-neutral-600 bg-neutral-800/80">
            {n}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-xs text-neutral-500">—</span>
    );

  return (
    <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3">
      <div>
        <div className="font-medium">What ManaTap players are browsing</div>
        <SectionCaption>
          Cards and commanders people look at in Discover on the site. The AI mixes this with YouTube/Reddit/RSS so drafts feel current.
        </SectionCaption>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <div className="text-neutral-400 text-xs mb-1">Hot cards</div>
          {chip(meta.trending_cards)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">Hot commanders</div>
          {chip(meta.trending_commanders)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">New set cards getting attention</div>
          {chip(meta.new_set_breakouts)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">Meta label</div>
          <p className="text-neutral-200 text-sm">{meta.meta_label ?? "—"}</p>
        </div>
      </div>
    </section>
  );
}

type AttributionData = {
  configured: boolean;
  campaign?: string;
  signups: number | null;
  pro_upgrades: number | null;
  posthog_url: string | null;
};

function PrimaryCtaCard({ brief }: { brief: MarketingBriefRow }) {
  const cta = brief.primary_cta;
  const [showUtm, setShowUtm] = React.useState(false);
  if (!cta) {
    return (
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="font-medium">Where to send players</div>
        <SectionCaption>
          This brief was created before the CTA feature. Run a new brief or regenerate drafts to get a single landing-page link for all posts.
        </SectionCaption>
      </section>
    );
  }

  const campaign = buildCampaignSlug(brief.brief_date);
  const formatLabel =
    brief.content_format && brief.content_format in CONTENT_FORMAT_LABELS
      ? CONTENT_FORMAT_LABELS[brief.content_format as keyof typeof CONTENT_FORMAT_LABELS]
      : brief.content_format;

  const platforms: MarketingUtmPlatform[] = ["x", "instagram", "blog"];

  return (
    <section className="rounded-xl border border-amber-900/40 bg-amber-950/15 p-4 space-y-3">
      <div>
        <div className="font-medium">Where to send players (one link for all posts)</div>
        <SectionCaption>
          Every draft (X, Instagram, blog) should point people to the same ManaTap page — usually a tool that matches the topic. You don&apos;t pick this manually; the AI chose it for this week&apos;s trend.
        </SectionCaption>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {formatLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-amber-800 bg-amber-900/30 text-amber-200" title="The angle of the posts — e.g. budget swaps vs mulligan tips">
            Post style: {formatLabel}
          </span>
        )}
        <span className="text-xs text-neutral-500" title="A short name PostHog uses to group signups from this week's posts">
          Tracking name: {campaign}
        </span>
      </div>
      <div className="text-sm space-y-2 rounded-lg border border-amber-900/30 bg-neutral-950/40 px-3 py-2">
        <div>
          <div className="text-neutral-500 text-xs mb-0.5">Page we&apos;re promoting</div>
          <a href={cta.landing_url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline break-all">
            {cta.landing_url}
          </a>
        </div>
        {brief.seo_target_keyword && (
          <div>
            <div className="text-neutral-500 text-xs mb-0.5">Google phrase for the blog post</div>
            <span className="text-neutral-200">{brief.seo_target_keyword}</span>
          </div>
        )}
        <p className="text-neutral-400 text-xs">{cta.rationale}</p>
      </div>
      <div>
        <button
          type="button"
          onClick={() => setShowUtm((v) => !v)}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          {showUtm ? "▾ Hide" : "▸ Show"} tracking links (technical — already inside your drafts in step 3)
        </button>
        {showUtm && (
          <div className="mt-2 space-y-2">
            <SectionCaption>
              Each platform gets slightly different URL tags (<code className="text-neutral-400">utm_source</code>) so analytics can tell X vs Instagram vs blog apart. You never need to copy these by hand.
            </SectionCaption>
            {platforms.map((p) => (
              <div key={p} className="text-xs font-mono text-neutral-400 break-all">
                <span className="text-neutral-500 uppercase w-16 inline-block">{p}</span>
                {appendMarketingUtm(cta.landing_url, { platform: p, campaign })}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AttributionPanel({ briefId }: { briefId: string }) {
  const [data, setData] = React.useState<AttributionData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/admin/marketing-radar/briefs/${briefId}/attribution`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error ?? "Failed to load attribution");
          return;
        }
        setData({
          configured: json.configured,
          campaign: json.campaign,
          signups: json.signups,
          pro_upgrades: json.pro_upgrades,
          posthog_url: json.posthog_url,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-2">
      <div>
        <div className="font-medium text-sm">Did these posts bring signups? (last 14 days)</div>
        <SectionCaption>
          After you post links from step 4, PostHog counts people who signed up (or upgraded to Pro) after clicking a link with this week&apos;s tracking name. Zero is normal until you&apos;ve actually posted.
        </SectionCaption>
      </div>
      {loading && <p className="text-xs text-neutral-500">Checking PostHog…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading && data && !data.configured && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          Analytics lookup isn&apos;t wired yet. Set{" "}
          <code className="text-amber-100">POSTHOG_PERSONAL_API_KEY</code> and{" "}
          <code className="text-amber-100">POSTHOG_PROJECT_ID</code> on the server — see{" "}
          <Link href="/admin/mobile-command-center" className="underline hover:text-amber-100">
            Mobile Command Center
          </Link>{" "}
          setup notes.
        </div>
      )}
      {!loading && data?.configured && (
        <div className="flex flex-wrap gap-4 text-sm items-end">
          <div>
            <div className="text-xs text-neutral-500">New accounts</div>
            <div className="text-lg font-medium text-emerald-300">{data.signups ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Pro purchases</div>
            <div className="text-lg font-medium text-emerald-300">
              {data.pro_upgrades != null ? data.pro_upgrades : "—"}
            </div>
            {data.pro_upgrades == null && (
              <div className="text-[10px] text-neutral-600">No Pro upgrades yet (or too few to show)</div>
            )}
          </div>
          {data.posthog_url && (
            <a
              href={data.posthog_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:underline"
            >
              Dig deeper in PostHog →
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function RepurposeSection({ brief }: { brief: MarketingBriefRow }) {
  const repurpose = brief.social_repurpose;
  const [open, setOpen] = React.useState(false);

  if (!repurpose) return null;
  const bullets = repurpose.x_thread_bullets ?? [];
  const slides = repurpose.instagram_carousel_slides ?? [];
  if (!bullets.length && !slides.length) return null;

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-neutral-800/40"
      >
        <div>
          <div className="font-medium text-sm">Bonus ideas from the blog (optional)</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            Extra X bullets or Instagram slide text — use if you want more posts without re-reading the full article.
          </div>
        </div>
        <span className="text-neutral-500 shrink-0 ml-2">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-neutral-800">
          {bullets.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="text-xs text-neutral-500">X thread — one tweet per bullet</div>
                <button
                  type="button"
                  onClick={() => copyText(bullets.map((b, i) => `${i + 1}. ${b}`).join("\n"))}
                  className="text-xs px-2 py-1 rounded border border-neutral-600 hover:bg-neutral-800"
                >
                  Copy all
                </button>
              </div>
              <ul className="text-sm space-y-1 list-decimal list-inside text-neutral-300">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {slides.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="text-xs text-neutral-500">Instagram carousel — one caption per slide</div>
                <button
                  type="button"
                  onClick={() => copyText(slides.map((s, i) => `Slide ${i + 1}: ${s}`).join("\n\n"))}
                  className="text-xs px-2 py-1 rounded border border-neutral-600 hover:bg-neutral-800"
                >
                  Copy all
                </button>
              </div>
              <ol className="text-sm space-y-2 text-neutral-300">
                {slides.map((s, i) => (
                  <li key={i} className="rounded border border-neutral-800 px-2 py-1.5">
                    <span className="text-neutral-500 text-xs">Slide {i + 1}</span>
                    <p className="mt-0.5">{s}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type Props = {
  brief: MarketingBriefRow | null;
  briefHistory: BriefHistoryItem[];
  selectedBriefId: string | null;
  signals: MarketingSignalRow[];
  meta: MarketingMetaSnapshot | null;
  onSelectBrief: (id: string) => void;
  onGoDrafts: () => void;
};

export function SummaryTab({
  brief,
  briefHistory,
  selectedBriefId,
  signals,
  meta,
  onSelectBrief,
  onGoDrafts,
}: Props) {
  const topSignals = [...signals].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);

  return (
    <div className="space-y-5">
      <ELI5
        heading="Step 2 — Read the plan (you don't post from here)"
        items={[
          "Think of this as the editor's briefing note: what's hot in MTG this week and which ManaTap tool we're pushing.",
          "Brief summary = notes for you. The actual tweets/captions/article are in step 3 (Drafts).",
          "When it makes sense, click Review drafts → approve what you like → step 4 to copy or publish the blog.",
          "You can ignore Attribution until after you've posted — it only matters once links are live.",
        ]}
      />

      {brief && (
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100/90">
          <span className="font-medium text-emerald-200">Your move:</span> skim the sections below, then{" "}
          <button type="button" onClick={onGoDrafts} className="underline hover:text-white">
            open Drafts
          </button>{" "}
          to read and approve the real posts.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
          <div>
            <div className="font-medium">Past runs</div>
            <SectionCaption>Each time you hit Run everything, a new row appears. Click one to see that week&apos;s plan.</SectionCaption>
          </div>
          <BriefHistory
            items={briefHistory}
            selectedId={selectedBriefId}
            onSelect={onSelectBrief}
          />
        </section>
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="font-medium">AI briefing note</div>
              <SectionCaption>Internal summary — not copy-paste for social. Shows trending cards/topics the AI noticed.</SectionCaption>
            </div>
            {brief && (
              <span className="text-xs text-neutral-500 shrink-0">
                {brief.brief_date} · {new Date(brief.created_at).toLocaleString()}
              </span>
            )}
          </div>
          <BriefDetail brief={brief} />
          {brief && (
            <button
              type="button"
              onClick={onGoDrafts}
              className="text-sm px-4 py-2 rounded-lg border border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40"
            >
              Review drafts →
            </button>
          )}
        </section>
      </div>

      {brief && <PrimaryCtaCard brief={brief} />}
      {brief && selectedBriefId && <AttributionPanel briefId={selectedBriefId} />}
      {brief && <RepurposeSection brief={brief} />}

      <MetaPanel meta={meta} />

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <div>
          <div className="font-medium">Raw sources this week</div>
          <SectionCaption>YouTube videos, Reddit threads, and articles we pulled in — the ingredients the AI used for the brief.</SectionCaption>
        </div>
        <SignalsList signals={topSignals} />
      </section>
    </div>
  );
}
