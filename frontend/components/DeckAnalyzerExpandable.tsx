"use client";

import React, { useState, useRef } from "react";

/**
 * Expandable Deck Analyzer Panel
 * Clicking the Deck Snapshot button expands this panel to analyze decklists
 */
export default function DeckAnalyzerExpandable() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<"Commander" | "Modern" | "Pioneer">("Commander");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [bands, setBands] = useState<any | null>(null);
  const [rawCounts, setRawCounts] = useState<{ lands: number; ramp: number; draw: number; removal: number } | null>(null);
  const [illegal, setIllegal] = useState<{ banned?: string[]; ci?: string[] }>({});
  const [meta, setMeta] = useState<Array<{ card: string; inclusion_rate: string; commanders: string[] }> | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV file and convert to decklist text
  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      
      // Parse CSV - handle various formats
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) {
        setError("CSV file is empty");
        return;
      }

      const hasHeader = /name|card|qty|quantity|count/i.test(lines[0] || "");
      const startIdx = hasHeader ? 1 : 0;

      // Try to detect column positions
      let nameIdx = 0;
      let qtyIdx = 1;
      
      if (hasHeader) {
        const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
        const nIdx = headers.findIndex((h) => ["name", "card", "card name"].includes(h));
        const qIdx = headers.findIndex((h) => ["qty", "quantity", "count"].includes(h));
        if (nIdx >= 0) nameIdx = nIdx;
        if (qIdx >= 0) qtyIdx = qIdx;
      }

      const deckLines: string[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        if (!cols.length) continue;

        let name = "";
        let qty = 1;

        if (hasHeader && cols.length > Math.max(nameIdx, qtyIdx)) {
          name = cols[nameIdx] || "";
          qty = Number(cols[qtyIdx] || "1");
        } else {
          // Try both orders: "2 Sol Ring" or "Sol Ring,2"
          const a = cols[0] || "";
          const b = cols[1] || "";
          if (/^\d+$/.test(a)) {
            qty = Number(a);
            name = b;
          } else if (/^\d+$/.test(b)) {
            name = a;
            qty = Number(b);
          } else {
            name = a;
            qty = 1;
          }
        }

        name = name.trim();
        if (!name || !Number.isFinite(qty) || qty < 1) continue;

        deckLines.push(`${qty} ${name}`);
      }

      if (deckLines.length === 0) {
        setError("No valid cards found in CSV");
        return;
      }

      setDeckText(deckLines.join("\n"));
      setError(null);
    } catch (e: any) {
      setError(`CSV import failed: ${e?.message || "Unknown error"}`);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function runAnalysis() {
    if (!deckText.trim()) {
      setError("Please paste a decklist or import from CSV");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      
      const payload: any = {
        deckText: deckText.trim(),
        format,
        useScryfall: true,
      };

      const res = await fetch("/api/deck/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        throw new Error(j?.error || res.statusText);
      }

      setScore(j?.score ?? null);
      setBands(j?.bands ?? null);
      if (j?.counts) setRawCounts(j.counts);
      setIllegal({ banned: j?.bannedExamples || [], ci: j?.illegalExamples || [] });
      setMeta(Array.isArray(j?.metaHints) ? j.metaHints.slice(0, 12) : []);
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
      setScore(null);
      setBands(null);
      setRawCounts(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {/* Clickable button/header - always visible */}
      <div
        className={`${isExpanded ? "rounded-t-xl border-b-0" : "rounded-xl"} bg-neutral-950 border border-neutral-800 cursor-pointer transition-all hover:border-neutral-700`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-4">
          <img
            src="/Deck_Snapshot_Horizontal_cropped.png"
            alt="Deck Snapshot / Judger - Click to analyze a decklist"
            className="w-full h-auto"
          />
        </div>
      </div>

      {/* Expandable panel */}
      {isExpanded && (
        <div className="border border-neutral-800 border-t-0 rounded-b-xl bg-neutral-950 p-4 space-y-4 animate-in slide-in-from-top-2">
          {/* Format selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400">Format:</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as any)}
              className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-200"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="Commander">Commander</option>
              <option value="Modern">Modern</option>
              <option value="Pioneer">Pioneer</option>
            </select>
          </div>

          {/* Input section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-400 flex-1">Paste decklist or import CSV:</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvImport}
                onClick={(e) => e.stopPropagation()}
                className="hidden"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                Import CSV
              </button>
            </div>
            <textarea
              value={deckText}
              onChange={(e) => {
                setDeckText(e.target.value);
                setError(null);
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="1 Sol Ring&#10;2 Lightning Bolt&#10;3 Counterspell&#10;..."
              className="w-full h-32 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
            />
          </div>

          {/* Run button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              runAnalysis();
            }}
            disabled={busy || !deckText.trim()}
            className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {busy ? "Analyzing..." : "Run Analysis"}
          </button>

          {/* Error display */}
          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
              {error}
            </div>
          )}

          {/* Results section */}
          {score !== null && bands && (
            <div className="space-y-3 pt-2 border-t border-neutral-800">
              {/* Score */}
              <div className="text-sm font-semibold">
                Score: <span className="text-violet-400">{score}</span>
              </div>

              {/* Recommendations */}
              {rawCounts && (
                <div className="text-[11px] space-y-1">
                  <div className="font-medium opacity-80">Recommendations</div>
                  {(() => {
                    const target = { lands: format === "Commander" ? 35 : 24, ramp: 8, draw: 8, removal: 5 };
                    const suggs: string[] = [];
                    const samples = {
                      ramp: ["Arcane Signet", "Fellwar Stone", "Talisman of Dominance"],
                      draw: ["Read the Bones", "Skullclamp", "Inspiring Call"],
                      removal: ["Swords to Plowshares", "Beast Within", "Go for the Throat"],
                      lands: ["Command Tower", "Path of Ancestry", "Exotic Orchard"],
                    } as any;
                    const deficit = (k: keyof typeof target) =>
                      Math.max(0, target[k] - (rawCounts as any)[k]);
                    if (deficit("lands") > 0)
                      suggs.push(`Add ${deficit("lands")} lands: ${samples.lands.slice(0, 2).join(", ")}`);
                    if (deficit("ramp") > 0)
                      suggs.push(`Add ${deficit("ramp")} ramp rocks: ${samples.ramp.slice(0, 2).join(", ")}`);
                    if (deficit("draw") > 0)
                      suggs.push(`Add ${deficit("draw")} draw spells: ${samples.draw.slice(0, 2).join(", ")}`);
                    if (deficit("removal") > 0)
                      suggs.push(`Add ${deficit("removal")} interaction: ${samples.removal.slice(0, 2).join(", ")}`);
                    if (suggs.length === 0) suggs.push("Looks balanced. Consider meta tweaks or upgrades.");
                    return (
                      <ul className="list-disc pl-4 space-y-0.5">
                        {suggs.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    );
                  })()}
                  
                  {/* Banned/CI conflicts */}
                  {((illegal?.banned?.length || 0) > 0 || (illegal?.ci?.length || 0) > 0) && (
                    <div className="mt-2 space-y-1">
                      {(illegal?.banned?.length || 0) > 0 && (
                        <div className="text-red-300">Banned: {(illegal?.banned || []).slice(0, 5).join(", ")}</div>
                      )}
                      {(illegal?.ci?.length || 0) > 0 && (
                        <div className="text-amber-300">CI conflicts: {(illegal?.ci || []).slice(0, 5).join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Progress bars */}
              <div className="space-y-2">
                {([["Curve", "curve"], ["Ramp", "ramp"], ["Draw", "draw"], ["Removal", "removal"], ["Mana", "mana"]] as const).map(([label, key]) => {
                  const pct = Math.round((bands?.[key] || 0) * 100);
                  const titleMap: any = {
                    Curve: "Mana curve — distribution of mana values",
                    Ramp: "Mana acceleration sources (rocks/land ramp)",
                    Draw: "Card advantage over time",
                    Removal: "Interaction to answer threats",
                    Mana: "Color fixing and sources",
                  };
                  return (
                    <div key={key} className="text-[11px]">
                      <div className="flex items-center justify-between mb-0.5">
                        <span title={titleMap[label]}>{label}</span>
                        <span className="font-mono">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-neutral-800 overflow-hidden">
                        <div className="h-1.5 bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tips */}
              <div className="text-[11px] opacity-70">
                {(() => {
                  const fmt = format.toLowerCase();
                  if (fmt === "commander") {
                    return (
                      <>
                        Tips: aim 34–38 lands (EDH), ~8{" "}
                        <span title="Card advantage effects that draw extra cards">draw</span>, ~8{" "}
                        <span title="Mana acceleration: rocks or ramp">ramp</span>, at least 5{" "}
                        <span title="Spells to remove opposing threats">interaction</span> pieces.
                      </>
                    );
                  } else if (fmt === "standard") {
                    return (
                      <>
                        Tips: aim 23–26 lands, 4–6{" "}
                        <span title="Card advantage effects that draw extra cards">draw</span>, 0–2{" "}
                        <span title="Mana acceleration: rocks or ramp">ramp</span>, 6–8{" "}
                        <span title="Spells to remove opposing threats">interaction</span> pieces.
                      </>
                    );
                  } else if (fmt === "modern") {
                    return (
                      <>
                        Tips: aim 19–22 lands, 4–6{" "}
                        <span title="Card advantage effects that draw extra cards">draw</span>, 0–4{" "}
                        <span title="Mana acceleration: rocks or ramp">ramp</span>, 8–10{" "}
                        <span title="Spells to remove opposing threats">interaction</span> pieces.
                      </>
                    );
                  }
                  return <>Tips: aim for a balanced mana base, card draw, and interaction.</>;
                })()}
              </div>

              {/* Link to deck page */}
              <div className="text-[11px] opacity-60 mt-2 pt-2 border-t border-neutral-800">
                <a 
                  href="/my-decks" 
                  className="text-violet-400 hover:text-violet-300 transition-colors underline"
                >
                  For more advanced analysis, go to your deck page →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

