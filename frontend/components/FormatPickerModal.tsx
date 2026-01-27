"use client";
import React from "react";
import { createPortal } from "react-dom";

type Format = "commander" | "standard" | "modern" | "pioneer" | "pauper";

interface FormatPickerModalProps {
  isOpen: boolean;
  onSelect: (format: Format) => void;
  onClose?: () => void;
}

export default function FormatPickerModal({ isOpen, onSelect, onClose }: FormatPickerModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const formats: Array<{ value: Format; label: string; description: string; icon: string }> = [
    {
      value: "commander",
      label: "Commander",
      description: "100-card singleton format with a legendary creature",
      icon: "⚔️",
    },
    {
      value: "standard",
      label: "Standard",
      description: "60-card format with recent sets only",
      icon: "⭐",
    },
    {
      value: "modern",
      label: "Modern",
      description: "60-card format with cards from 2003 onwards",
      icon: "🔮",
    },
    {
      value: "pioneer",
      label: "Pioneer",
      description: "60-card format with cards from Return to Ravnica onwards",
      icon: "🗺️",
    },
    {
      value: "pauper",
      label: "Pauper",
      description: "60-card format with only common rarity cards",
      icon: "🪙",
    },
  ];

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            Choose Your Format
          </h2>
          <p className="text-sm text-neutral-400">
            Select the format for your new deck. This affects card legality, deck size, and recommendations.
          </p>
        </div>

        {/* Format Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {formats.map((format) => (
            <button
              key={format.value}
              onClick={() => onSelect(format.value)}
              className="group relative p-6 rounded-lg border-2 border-neutral-700 bg-neutral-800/50 hover:border-cyan-500 hover:bg-neutral-800 transition-all duration-200 text-left hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20"
            >
              <div className="text-4xl mb-3">{format.icon}</div>
              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                {format.label}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {format.description}
              </p>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              </div>
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        {onClose && (
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

