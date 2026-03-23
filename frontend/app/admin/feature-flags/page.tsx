"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";

type Row = {
  key: string;
  enabled: boolean;
  description: string | null;
  value: Record<string, unknown>;
  platform: string;
  updated_at: string;
  updated_by: string | null;
};

const PLATFORMS = ["all", "mobile", "ios", "android", "web"] as const;

export default function AdminFeatureFlagsPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    key: "",
    enabled: true,
    description: "",
    valueJson: "{}",
    platform: "all" as (typeof PLATFORMS)[number],
  });

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/mobile/feature-flags", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || r.statusText);
      setRows(j.rows || []);
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
      let value: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(form.valueJson || "{}");
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Value must be a JSON object");
        }
        value = parsed as Record<string, unknown>;
      } catch (ve: unknown) {
        throw new Error(ve instanceof Error ? ve.message : "Invalid JSON");
      }
      const r = await fetch("/api/admin/mobile/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key.trim(),
          enabled: form.enabled,
          description: form.description || null,
          value,
          platform: form.platform,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      await load();
      setForm({ key: "", enabled: true, description: "", valueJson: "{}", platform: "all" });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  function editRow(r: Row) {
    setForm({
      key: r.key,
      enabled: r.enabled,
      description: r.description || "",
      valueJson: JSON.stringify(r.value ?? {}, null, 2),
      platform: (r.platform as (typeof PLATFORMS)[number]) || "all",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Feature Flags (mobile)</h1>
      <ELI5
        heading="Feature Flags"
        items={[
          "Turn app features on or off without shipping a new build.",
          "Optional JSON payload per flag for extra settings (e.g. sample deck id).",
          "Platform narrows who receives the flag (all / mobile / ios / android / web).",
        ]}
      />

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <form onSubmit={save} className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">Create or update flag</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-sm">
            <div className="opacity-70 mb-1">Key</div>
            <input
              required
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
              placeholder="mobile.enable_roast"
            />
          </label>
          <label className="text-sm flex items-end gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span>Enabled</span>
          </label>
        </div>
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Description</div>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-sm">
            <div className="opacity-70 mb-1">Platform</div>
            <select
              value={form.platform}
              onChange={(e) =>
                setForm((f) => ({ ...f, platform: e.target.value as (typeof PLATFORMS)[number] }))
              }
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Value (JSON object)</div>
          <textarea
            value={form.valueJson}
            onChange={(e) => setForm((f) => ({ ...f, valueJson: e.target.value }))}
            rows={5}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
        >
          {saving ? "Saving…" : "Save flag"}
        </button>
      </form>

      <div className="rounded-xl border border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/80 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-2">Key</th>
                <th className="p-2">On</th>
                <th className="p-2">Platform</th>
                <th className="p-2">Description</th>
                <th className="p-2">Updated</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-4 text-neutral-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-neutral-500">
                    No rows (run migration 097 or check service role).
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-800">
                    <td className="p-2 font-mono text-xs align-top">{r.key}</td>
                    <td className="p-2 align-top">{r.enabled ? "yes" : "no"}</td>
                    <td className="p-2 align-top">{r.platform}</td>
                    <td className="p-2 text-neutral-400 align-top max-w-xs">{r.description || "—"}</td>
                    <td className="p-2 text-xs text-neutral-500 align-top whitespace-nowrap">
                      {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 align-top">
                      <button
                        type="button"
                        onClick={() => editRow(r)}
                        className="text-xs text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
