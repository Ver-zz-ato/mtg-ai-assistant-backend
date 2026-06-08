"use client";

const STEPS = [
  { label: "Load", activeKey: "load" as const },
  { label: "Refine", activeKey: "refine" as const },
  { label: "Review", activeKey: "review" as const },
  { label: "Save", activeKey: "save" as const },
];

type Props = {
  hasDeck: boolean;
  hasResult: boolean;
  hasApplied: boolean;
};

export function WorkshopWorkflowRail({ hasDeck, hasResult, hasApplied }: Props) {
  const active = {
    load: hasDeck,
    refine: hasDeck,
    review: hasResult || hasApplied,
    save: hasApplied,
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/40 p-2">
      {STEPS.map((step, index) => (
        <div key={step.label} className="flex items-center gap-1">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              active[step.activeKey]
                ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                : "border-neutral-700 bg-neutral-800/60 text-neutral-500"
            }`}
          >
            {step.label}
          </span>
          {index < STEPS.length - 1 ? (
            <span className="text-neutral-600 text-xs" aria-hidden="true">
              ›
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
