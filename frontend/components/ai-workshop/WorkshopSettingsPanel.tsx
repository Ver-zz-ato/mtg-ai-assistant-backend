"use client";

import {
  AI_WORKSHOP_MAX_CHANGE_OPTIONS,
  BUDGET_LEVELS,
  POWER_LEVELS,
  getAiWorkshopSubTargetOptions,
  type AiWorkshopMaxChanges,
  type BudgetLevel,
  type PowerLevel,
} from "@/lib/deck/ai-workshop-rules";

type Props = {
  powerLevel: PowerLevel;
  budgetLevel: BudgetLevel;
  maxChanges: AiWorkshopMaxChanges;
  availableMaxChangeOptions: AiWorkshopMaxChanges[];
  selectedActionId: string;
  selectedSubTarget: string;
  preserveCommanderPackage: boolean;
  lockManaBase: boolean;
  onlyChangeNonlands: boolean;
  preserveCardsText: string;
  avoidCardsThemesText: string;
  extraNotes: string;
  isCommanderDeck: boolean;
  onPowerLevel: (v: PowerLevel) => void;
  onBudgetLevel: (v: BudgetLevel) => void;
  onMaxChanges: (v: AiWorkshopMaxChanges) => void;
  onSubTarget: (v: string) => void;
  onPreserveCommanderPackage: (v: boolean) => void;
  onLockManaBase: (v: boolean) => void;
  onOnlyChangeNonlands: (v: boolean) => void;
  onPreserveCardsText: (v: string) => void;
  onAvoidCardsThemesText: (v: string) => void;
  onExtraNotes: (v: string) => void;
};

export function WorkshopSettingsPanel(props: Props) {
  const subTargets = getAiWorkshopSubTargetOptions(props.selectedActionId);

  return (
    <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-300">Refinement settings</h3>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Power level</span>
          <select
            value={props.powerLevel}
            onChange={(e) => props.onPowerLevel(e.target.value as PowerLevel)}
            className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {POWER_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Budget tier</span>
          <select
            value={props.budgetLevel}
            onChange={(e) => props.onBudgetLevel(e.target.value as BudgetLevel)}
            className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {BUDGET_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Max changes</span>
          <select
            value={props.maxChanges}
            onChange={(e) => props.onMaxChanges(e.target.value as AiWorkshopMaxChanges)}
            className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {AI_WORKSHOP_MAX_CHANGE_OPTIONS.filter((opt) =>
              props.availableMaxChangeOptions.includes(opt),
            ).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      {subTargets.length > 0 ? (
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Sub-target focus</span>
          <select
            value={props.selectedSubTarget}
            onChange={(e) => props.onSubTarget(e.target.value)}
            className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {subTargets.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {props.isCommanderDeck ? (
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={props.preserveCommanderPackage}
              onChange={(e) => props.onPreserveCommanderPackage(e.target.checked)}
              className="rounded border-neutral-600"
            />
            Preserve commander package
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={props.lockManaBase}
            onChange={(e) => props.onLockManaBase(e.target.checked)}
            className="rounded border-neutral-600"
          />
          Lock mana base
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={props.onlyChangeNonlands}
            onChange={(e) => props.onOnlyChangeNonlands(e.target.checked)}
            className="rounded border-neutral-600"
          />
          Only change nonlands
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Preserve cards (comma or newline)</span>
          <textarea
            value={props.preserveCardsText}
            onChange={(e) => props.onPreserveCardsText(e.target.value)}
            rows={2}
            placeholder="Sol Ring, Command Tower"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Avoid cards/themes</span>
          <textarea
            value={props.avoidCardsThemesText}
            onChange={(e) => props.onAvoidCardsThemesText(e.target.value)}
            rows={2}
            placeholder="Stax, extra turns"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-medium text-neutral-400">Extra notes (optional)</span>
        <textarea
          value={props.extraNotes}
          onChange={(e) => props.onExtraNotes(e.target.value)}
          rows={2}
          placeholder="Anything else the AI should know for this pass"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
        />
      </label>
    </div>
  );
}
