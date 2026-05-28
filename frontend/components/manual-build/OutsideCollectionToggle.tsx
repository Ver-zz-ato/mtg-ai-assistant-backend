"use client";

interface OutsideCollectionToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function OutsideCollectionToggle({ checked, onChange }: OutsideCollectionToggleProps) {
  return (
    <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-neutral-600 bg-neutral-900 text-purple-600 focus:ring-purple-500"
      />
      <span className="text-sm text-neutral-300">Pick from outside collection</span>
    </label>
  );
}
