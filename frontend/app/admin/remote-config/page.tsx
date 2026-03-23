"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";

type Row = {
  key: string;
  description: string | null;
  value: unknown;
  platform: string;
  updated_at: string;
  updated_by: string | null;
};

const PLATFORMS = ["all", "mobile", "ios", "android", "web"] as const;

function previewJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 0);
  } catch {
    return String(v);
  }
}

export default function AdminRemoteConfigPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    key: "",
    description: "",
    valueJson: "{}",
    platform: "all" as (typeof PLATFORMS)[number],
  });

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/mobile/remote-config", { cache: "no-store" });
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
      let value: unknown;
      try {
        value = JSON.parse(form.valueJson || "null");
      } catch {
        throw new Error("Invalid JSON");
      }
      const r = await fetch("/api/admin/mobile/remote-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key.trim(),
          description: form.description || null,
          value,
          platform: form.platform,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      await load();
      setForm({ key: "", description: "", valueJson: "{}", platform: "all" });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  function editRow(r: Row) {
    setForm({
      key: r.key,
      description: r.description || "",
      valueJson: JSON.stringify(r.value, null, 2),
      platform: (r.platform as (typeof PLATFORMS)[number]) || "all",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Remote Config</h1>
      <ELI5
        heading="Remote Config"
        items={[
          "Structured JSON the app reads at runtime (hero copy, section order, paywall hints, etc.).",
          "Values can be objects or arrays — validate in the editor before save.",
        ]}
      />

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <form onSubmit={save} className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">Create or update key</h2>
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Key</div>
          <input
            required
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Description</div>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
          />
        </label>
        <label className="text-sm block">
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
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Value (JSON)</div>
          <textarea
            value={form.valueJson}
            onChange={(e) => setForm((f) => ({ ...f, valueJson: e.target.value }))}
            rows={12}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
        >
          {saving ? "Saving…" : "Save config"}
        </button>
      </form>

      <div className="rounded-xl border border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/80 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-2">Key</th>
                <th className="p-2">Platform</th>
                <th className="p-2">Description</th>
                <th className="p-2 max-w-md">Preview</th>
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
                    No rows.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-800">
                    <td className="p-2 font-mono text-xs align-top">{r.key}</td>
                    <td className="p-2 align-top">{r.platform}</td>
                    <td className="p-2 text-neutral-400 align-top max-w-xs">{r.description || "—"}</td>
                    <td className="p-2 font-mono text-[10px] text-neutral-500 align-top break-all max-w-md">
                      {previewJson(r.value).slice(0, 400)}
                      {previewJson(r.value).length > 400 ? "…" : ""}
                    </td>
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
