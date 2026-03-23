"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";

export default function AdminTierLimitsPage() {
  const [valueJson, setValueJson] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [updated, setUpdated] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/mobile/tier-limits", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || r.statusText);
      const v = j.row?.value;
      setValueJson(JSON.stringify(v ?? {}, null, 2));
      setUpdated(j.row?.updated_at ?? null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/mobile/tier-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valueJson }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Tier &amp; Limits</h1>
      <ELI5
        heading="Tier limits"
        items={[
          "Stored under remote_config key `mobile.tiers.limits`.",
          "Must include guest, free, and pro objects with chatPerDay, deckAnalysisPerDay, roastPerDay.",
          "Use -1 for unlimited (Pro).",
        ]}
      />

      {updated ? (
        <p className="text-xs text-neutral-500">Last updated: {new Date(updated).toLocaleString()}</p>
      ) : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <label className="text-sm block">
            <div className="opacity-70 mb-1">mobile.tiers.limits (JSON)</div>
            <textarea
              value={valueJson}
              onChange={(e) => setValueJson(e.target.value)}
              rows={18}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving…" : "Save tier limits"}
          </button>
        </form>
      )}
    </div>
  );
}
