"use client";
import React from "react";
import CopyDecklistButton from "./CopyDecklistButton";
import ExportDeckCSV from "./ExportDeckCSV";
import ExportToMoxfield from "./ExportToMoxfield";
import ExportToTCGPlayer from "./ExportToTCGPlayer";

export default function ExportDropdown({ deckId }: { deckId: string }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 rounded px-2.5 py-1.5 transition-colors font-medium flex items-center gap-1.5 text-neutral-300"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export to...
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 py-1">
          <div className="px-2 py-1.5 text-[10px] text-neutral-400 uppercase font-semibold border-b border-neutral-800">
            Export Options
          </div>
          <div className="p-2 space-y-1">
            <div onClick={() => setIsOpen(false)}>
              <CopyDecklistButton 
                deckId={deckId} 
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-neutral-800 transition-colors flex items-center gap-2"
              />
            </div>
            <div onClick={() => setIsOpen(false)}>
              <ExportDeckCSV 
                deckId={deckId} 
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-neutral-800 transition-colors flex items-center gap-2"
              />
            </div>
            <div onClick={() => setIsOpen(false)}>
              <ExportToMoxfield 
                deckId={deckId} 
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-neutral-800 transition-colors flex items-center gap-2"
              />
            </div>
            <div onClick={() => setIsOpen(false)}>
              <ExportToTCGPlayer 
                deckId={deckId} 
                className="w-full text-left text-xs px-3 py-2 rounded hover:bg-neutral-800 transition-colors flex items-center gap-2"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


