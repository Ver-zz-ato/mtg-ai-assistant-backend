"use client";
import React from "react";

type Format = "commander" | "standard" | "modern" | "pioneer" | "pauper";

export default function FormatSelector({
  deckId,
  initialFormat,
  onFormatChange,
}: {
  deckId: string;
  initialFormat?: string;
  onFormatChange?: (format: Format) => void;
}) {
  const [format, setFormat] = React.useState<Format>(
    (initialFormat?.toLowerCase() as Format) || "commander"
  );
  const [updating, setUpdating] = React.useState(false);

  async function updateFormat(newFormat: Format) {
    if (newFormat === format) return;
    const label = formats.find((f) => f.value === newFormat)?.label || newFormat;
    const ok = window.confirm(
      `Change this deck format to ${label}?\n\nThis affects AI recommendations, card-count checks, legality rules, and deck analysis.`
    );
    if (!ok) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: newFormat }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Failed to update format");
      }
      setFormat(newFormat);
      onFormatChange?.(newFormat);
      // Reload page to update all format-dependent modules
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Failed to update format");
    } finally {
      setUpdating(false);
    }
  }

  const formats: Array<{ value: Format; label: string }> = [
    { value: "commander", label: "Commander" },
    { value: "standard", label: "Standard" },
    { value: "modern", label: "Modern" },
    { value: "pioneer", label: "Pioneer" },
    { value: "pauper", label: "Pauper" },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs opacity-70">Format:</span>
      <select
        value={format}
        disabled={updating}
        onChange={(e) => updateFormat(e.target.value as Format)}
        className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100 outline-none transition-colors hover:bg-cyan-500/20 focus:border-cyan-300 disabled:cursor-wait disabled:opacity-60"
        title="Change deck format"
      >
        {formats.map((f) => (
          <option key={f.value} value={f.value} className="bg-neutral-950 text-white">
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}

