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
    <div className="flex items-center gap-1.5">
      <span className="text-xs opacity-70 mr-1">Format:</span>
      {formats.map((f) => (
        <button
          key={f.value}
          disabled={updating}
          onClick={() => updateFormat(f.value)}
          className={`px-3 py-1 text-xs rounded-full transition-all ${
            format === f.value
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30"
              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700"
          } ${updating ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

