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
        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(action.id)}
            className={`min-h-[88px] rounded-xl border p-3 text-left transition touch-manipulation ${
              selected
                ? "border-violet-400/50 bg-violet-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "border-neutral-700 bg-neutral-900/50 hover:border-neutral-600"
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <Icon
              size={18}
              className={selected ? "text-violet-200" : "text-neutral-400"}
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
