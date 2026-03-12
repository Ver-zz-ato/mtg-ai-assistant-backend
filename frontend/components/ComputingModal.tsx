'use client';

import React from 'react';

const DEFAULT_STAGES = [
  { icon: '📋', label: 'Analyzing your deck...' },
  { icon: '💰', label: 'Looking up prices...' },
  { icon: '⚙️', label: 'Computing totals...' },
  { icon: '✨', label: 'Almost done...' },
];

export type ComputingStage = { icon: string; label: string };

interface ComputingModalProps {
  isOpen: boolean;
  title?: string;
  stages?: ComputingStage[];
  /** Cycle interval in ms */
  cycleInterval?: number;
  /** When true, show single message with indeterminate progress (no fake stage cycling) */
  indeterminate?: boolean;
  /** Label when indeterminate */
  indeterminateLabel?: string;
}

export default function ComputingModal({
  isOpen,
  title = 'Computing',
  stages = DEFAULT_STAGES,
  cycleInterval = 2500,
  indeterminate = false,
  indeterminateLabel = 'Please wait...',
}: ComputingModalProps) {
  const [stageIndex, setStageIndex] = React.useState(0);

  React.useEffect(() => {
    if (!isOpen || indeterminate) {
      setStageIndex(0);
      return;
    }
    const id = setInterval(() => {
      setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    }, cycleInterval);
    return () => clearInterval(id);
  }, [isOpen, indeterminate, stages.length, cycleInterval]);

  if (!isOpen) return null;

  const stage = indeterminate ? { icon: '🔥', label: indeterminateLabel } : stages[stageIndex];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{stage.icon}</div>
            <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
          </div>
          <p className="text-sm text-neutral-400 text-center">{stage.label}</p>
          <div className="w-full">
            <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 ${
                  indeterminate ? 'animate-pulse' : 'transition-all duration-500 ease-out'
                }`}
                style={
                  indeterminate
                    ? { width: '100%' }
                    : { width: `${Math.min(95, ((stageIndex + 1) / stages.length) * 100)}%` }
                }
              />
            </div>
            {!indeterminate && (
              <div className="flex justify-between mt-1.5 text-[10px] text-neutral-500">
                {stages.map((s, i) => (
                  <span key={i} className={i <= stageIndex ? 'text-neutral-400' : ''}>
                    {s.icon}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
