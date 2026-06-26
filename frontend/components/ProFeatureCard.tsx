"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { useProStatus } from "@/hooks/useProStatus";
import { setActiveProFeature, trackProGateClicked, trackProGateViewed, trackProUpgradeStarted } from "@/lib/analytics-pro";

type ProFeatureCardProps = {
  feature: string;
  location: string;
  title: string;
  description: string;
  cta?: string;
  compact?: boolean;
};

export default function ProFeatureCard({
  feature,
  location,
  title,
  description,
  cta = "Upgrade",
  compact = false,
}: ProFeatureCardProps) {
  const { isPro, loading } = useProStatus();

  if (loading) {
    return (
      <div className="inline-flex w-full items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <span className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-white/10" />
        <span className="h-4 w-24 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (isPro) {
    return (
      <div className="inline-flex w-full items-center justify-between gap-3 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-200/25 bg-emerald-200/10">
            <Sparkles size={14} aria-hidden="true" />
          </span>
          <span>Pro active</span>
        </div>
        {!compact ? <span className="hidden text-xs text-emerald-100/70 sm:inline">Deeper limits unlocked</span> : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-amber-300/25 bg-gradient-to-br from-amber-300/12 via-neutral-950/75 to-violet-400/10 p-3 text-sm text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      onMouseEnter={() => trackProGateViewed(feature, location, { is_pro: false })}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-300/30 bg-black/30 text-amber-200">
          <Lock size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <p className="mt-1 text-xs leading-5 text-amber-50/75">{description}</p>
          <Link
            href="/pricing"
            onClick={() => {
              setActiveProFeature(feature);
              trackProGateClicked(feature, location);
              trackProUpgradeStarted("gate", { feature, location });
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-300 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-amber-200"
          >
            <Sparkles size={14} aria-hidden="true" />
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
