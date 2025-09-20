"use client";
import React from "react";

type Meta = {
  mtg_snapshot_v: 1;
  total: number;
  lands: number;
  spells: number;
  sideboard?: number;
  ramp: number;
  draw: number;
  removal: number;
  mana_basics: number;
  health: number; // 0-100
};

function parseMetaFromMessage(content: string): Meta | null {
  const m = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    if (obj && obj.mtg_snapshot_v === 1) return obj as Meta;
  } catch {}
  return null;
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-xs opacity-80">{label}</div>
      <div className="flex-1 h-2 bg-neutral-800 rounded">
        <div className="h-2 rounded" style={{ width: `${pct}%`, background: "#f0b90b" }} />
      </div>
    </div>
  );
}

export function DeckSnapshotCard({ content }: { content: string }) {
  const meta = parseMetaFromMessage(content);
  if (!meta) return null;
  const issues: string[] = [];
  if (meta.total && meta.total < 60) issues.push(`Mainboard has ${meta.total} cards (under 60).`);
  if (meta.lands && meta.lands < 20) issues.push(`Only ${meta.lands} basic lands detected — check your mana base.`);
  return (
    <div className="rounded-2xl border border-neutral-700 bg-neutral-900/60 p-4 shadow-lg text-neutral-100">
      <div className="text-sm font-semibold mb-2">
        Deck Health: <span className="text-yellow-400">{meta.health}/100</span>
        <span className="opacity-70"> — quick snapshot</span>
      </div>
      <div className="grid grid-cols-5 gap-4 text-xs mb-3">
        <div><div className="opacity-70">Mainboard</div><div className="font-medium">{meta.total}</div></div>
        <div><div className="opacity-70">Lands</div><div className="font-medium">{meta.lands}</div></div>
        <div><div className="opacity-70">Spells</div><div className="font-medium">{meta.spells}</div></div>
        <div><div className="opacity-70">Sideboard</div><div className="font-medium">{meta.sideboard ?? 0}</div></div>
        <div><div className="opacity-70">Basics</div><div className="font-medium">{meta.mana_basics}</div></div>
      </div>
      <div className="space-y-2 mb-3">
        <Bar label="Ramp" value={Math.min(100, (meta.ramp / 10) * 100)} />
        <Bar label="Draw" value={Math.min(100, (meta.draw / 8) * 100)} />
        <Bar label="Removal" value={Math.min(100, (meta.removal / 8) * 100)} />
        <Bar label="Mana" value={Math.min(100, (meta.mana_basics / 34) * 100)} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="font-semibold mb-1">What’s good</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Healthy ramp density.</li>
            <li>Core ratios look playable.</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-1">Quick fixes</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Target ~34–36 lands for EDH; adjust basics.</li>
            <li>Add draw to stay fueled (aim ~8).</li>
            <li>1–2 cheap interaction pieces if below 6–8.</li>
          </ul>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <a href="/decks/new" className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm">Save deck</a>
        <a href="/decks" className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm">My Decks →</a>
      </div>
    </div>
  );
}
