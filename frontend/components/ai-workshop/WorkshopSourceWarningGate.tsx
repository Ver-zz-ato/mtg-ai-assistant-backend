"use client";

type IssueSummary = {
  offColorLineCount: number;
  illegalLineCount: number;
  copyViolationCount: number;
  sourceCount: number;
  targetCount: number;
  sizeDelta: number;
  landCountSeverelyBroken: boolean;
};

type Props = {
  severity: "review" | "blocked";
  format: string;
  commander?: string | null;
  issueSummary: IssueSummary;
  messages: string[];
  selectedActionId: string;
  confirmed: boolean;
  onConfirm: () => void;
  onSelectFixLegality: () => void;
};

function summarizeIssues(summary: IssueSummary): string[] {
  const bits: string[] = [];
  if (summary.offColorLineCount > 0) {
    bits.push(`${summary.offColorLineCount} line(s) appear outside commander color identity`);
  }
  if (summary.illegalLineCount > 0) {
    bits.push(`${summary.illegalLineCount} line(s) may be illegal for the format`);
  }
  if (summary.copyViolationCount > 0) {
    bits.push(`${summary.copyViolationCount} copy-count issue(s)`);
  }
  if (Math.abs(summary.sourceCount - summary.targetCount) > 5) {
    bits.push(`deck size is ${summary.sourceCount} (expected ~${summary.targetCount})`);
  }
  if (summary.landCountSeverelyBroken) {
    bits.push("land count looks severely off for a constructed list");
  }
  return bits;
}

export function WorkshopSourceWarningGate({
  severity,
  format,
  commander,
  issueSummary,
  messages,
  selectedActionId,
  confirmed,
  onConfirm,
  onSelectFixLegality,
}: Props) {
  const isFixLegality = selectedActionId === "legality";
  const isBlocked = severity === "blocked";
  const issueBits = summarizeIssues(issueSummary);
  const topMessages = messages.slice(0, 3);

  return (
    <div
      className={`rounded-xl border p-5 ${
        isBlocked
          ? "border-rose-500/35 bg-rose-500/10"
          : "border-amber-500/35 bg-amber-500/10"
      }`}
    >
      <h2 className="text-lg font-bold text-white">
        {isBlocked ? "Source deck needs review before refinement" : "Check commander and format first"}
      </h2>
      <p className="mt-2 text-sm text-neutral-300">
        This list may not match the selected {format} setup
        {commander ? ` for [[${commander}]]` : ""}. Running some passes on a broken source can remove many cards
        or produce unreliable suggestions.
      </p>

      {issueBits.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">
          {issueBits.map((bit) => (
            <li key={bit}>{bit}</li>
          ))}
        </ul>
      ) : null}

      {topMessages.length ? (
        <div className="mt-3 rounded-lg border border-neutral-700/80 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">
          {topMessages.map((msg) => (
            <p key={msg} className="mt-1 first:mt-0">
              {msg}
            </p>
          ))}
        </div>
      ) : null}

      {isFixLegality ? (
        <p className="mt-3 text-sm text-amber-100">
          Fix legality may leave an underfilled deck if many cards must be removed. Review the preview before saving.
        </p>
      ) : isBlocked && !confirmed ? (
        <p className="mt-3 text-sm text-rose-100">
          Confirm the commander and format are correct, or run <strong>Fix legality</strong> first before other passes.
        </p>
      ) : (
        <p className="mt-3 text-sm text-amber-100">
          Consider running <strong>Fix legality</strong> first if commander, format, or deck size looks wrong.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!isFixLegality ? (
          <button
            type="button"
            onClick={onSelectFixLegality}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 touch-manipulation"
          >
            Switch to Fix legality
          </button>
        ) : null}
        {isBlocked && !isFixLegality && !confirmed ? (
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-[40px] items-center rounded-lg border border-neutral-600 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 touch-manipulation"
          >
            Commander and format are correct — continue anyway
          </button>
        ) : null}
      </div>
    </div>
  );
}
