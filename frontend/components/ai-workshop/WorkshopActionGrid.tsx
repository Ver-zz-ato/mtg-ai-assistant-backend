"use client";

import type { WorkshopAction } from "@/lib/deck/ai-workshop-actions";
import {
  BadgeCheck,
  ChartLine,
  Coins,
  Droplets,
  Heart,
  Shield,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  droplets: Droplets,
  "chart-line": ChartLine,
  shield: Shield,
  coins: Coins,
  swords: Swords,
  heart: Heart,
  "badge-check": BadgeCheck,
};

const ACTION_STYLES: Record<
  string,
  { idle: string; selected: string; iconIdle: string; iconSelected: string }
> = {
  general: {
    idle: "border-violet-500/25 bg-violet-950/35 hover:border-violet-400/40",
    selected: "border-violet-400/60 bg-violet-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-violet-300/80",
    iconSelected: "text-violet-200",
  },
  mana: {
    idle: "border-sky-500/25 bg-sky-950/35 hover:border-sky-400/40",
    selected: "border-sky-400/60 bg-sky-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-sky-300/80",
    iconSelected: "text-sky-200",
  },
  curve: {
    idle: "border-amber-500/25 bg-amber-950/35 hover:border-amber-400/40",
    selected: "border-amber-400/60 bg-amber-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-amber-300/80",
    iconSelected: "text-amber-200",
  },
  interaction: {
    idle: "border-emerald-500/25 bg-emerald-950/35 hover:border-emerald-400/40",
    selected: "border-emerald-400/60 bg-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-emerald-300/80",
    iconSelected: "text-emerald-200",
  },
  budget: {
    idle: "border-yellow-500/25 bg-yellow-950/35 hover:border-yellow-400/40",
    selected: "border-yellow-400/60 bg-yellow-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-yellow-300/80",
    iconSelected: "text-yellow-200",
  },
  optimized: {
    idle: "border-rose-500/25 bg-rose-950/35 hover:border-rose-400/40",
    selected: "border-rose-400/60 bg-rose-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-rose-300/80",
    iconSelected: "text-rose-200",
  },
  casual: {
    idle: "border-pink-500/25 bg-pink-950/35 hover:border-pink-400/40",
    selected: "border-pink-400/60 bg-pink-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-pink-300/80",
    iconSelected: "text-pink-200",
  },
  legality: {
    idle: "border-teal-500/25 bg-teal-950/35 hover:border-teal-400/40",
    selected: "border-teal-400/60 bg-teal-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    iconIdle: "text-teal-300/80",
    iconSelected: "text-teal-200",
  },
};

const DEFAULT_ACTION_STYLE = ACTION_STYLES.general;

type Props = {
  actions: WorkshopAction[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

export function WorkshopActionGrid({ actions, selectedId, onSelect, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {actions.map((action) => {
        const Icon = ICONS[action.icon] ?? Sparkles;
        const selected = action.id === selectedId;
        const style = ACTION_STYLES[action.id] ?? DEFAULT_ACTION_STYLE;
        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(action.id)}
            className={`min-h-[88px] rounded-xl border p-3 text-left transition touch-manipulation ${
              selected ? style.selected : style.idle
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <Icon
              size={18}
              className={selected ? style.iconSelected : style.iconIdle}
              aria-hidden="true"
            />
            <div className={`mt-2 text-sm font-bold ${selected ? "text-white" : "text-neutral-200"}`}>
              {action.title}
            </div>
            <div className="mt-0.5 text-xs text-neutral-400">{action.subtitle}</div>
          </button>
        );
      })}
    </div>
  );
}
