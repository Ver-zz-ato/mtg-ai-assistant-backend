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
  const { isPro } = useProStatus();

  if (isPro) {
    return (
      <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles size={16} aria-hidden="true" />
          Pro active
        </div>
        {!compact ? <p className="mt-1 text-xs text-emerald-100/75">You already have the deeper limits and Pro-only tools.</p> : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-50"
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
