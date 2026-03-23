"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";

type Row = {
  id: string;
  title: string;
  body: string;
  platform: string;
  min_app_version: string | null;
  max_app_version: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
};

const PLATFORMS = ["all", "mobile", "ios", "android", "web"] as const;

export default function AdminAppWhatsNewPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    id: "" as string,
    title: "",
    body: "",
    platform: "mobile" as (typeof PLATFORMS)[number],
    min_app_version: "",
    max_app_version: "",
    is_active: true,
    starts_at: "",
    ends_at: "",
    priority: 100,
  });

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/mobile/app-changelog", { cache: "no-store" });
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

  function resetForm() {
    setForm({
      id: "",
      title: "",
      body: "",
      platform: "mobile",
      min_app_version: "",
      max_app_version: "",
      is_active: true,
      starts_at: "",
      ends_at: "",
      priority: 100,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        body: form.body.trim(),
        platform: form.platform,
        min_app_version: form.min_app_version.trim() || null,
        max_app_version: form.max_app_version.trim() || null,
        is_active: form.is_active,
        starts_at: form.starts_at.trim() ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at.trim() ? new Date(form.ends_at).toISOString() : null,
        priority: form.priority,
      };
      if (form.id) payload.id = form.id;

      const r = await fetch("/api/admin/mobile/app-changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      await load();
      resetForm();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  function editRow(r: Row) {
    setForm({
      id: r.id,
      title: r.title,
      body: r.body,
      platform: (r.platform as (typeof PLATFORMS)[number]) || "mobile",
      min_app_version: r.min_app_version || "",
      max_app_version: r.max_app_version || "",
      is_active: r.is_active,
      starts_at: r.starts_at ? r.starts_at.slice(0, 16) : "",
      ends_at: r.ends_at ? r.ends_at.slice(0, 16) : "",
      priority: r.priority,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • App What&apos;s New</h1>
      <ELI5
        heading="App What's New"
        items={[
          "Entries power the mobile bootstrap `whatsNew` list (titles + body).",
          "Schedule with starts_at / ends_at; filter by min/max app version when set.",
          "Lower priority number sorts earlier in the bootstrap list.",
          "Legacy: app_config `app_changelog` JSON still exists for older flows — new source is the `app_changelog` table.",
        ]}
      />

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <form onSubmit={save} className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">{form.id ? "Edit entry" : "New entry"}</h2>
        {form.id ? (
          <p className="text-xs text-neutral-500 font-mono">
            id: {form.id}{" "}
            <button type="button" className="text-blue-400 ml-2" onClick={resetForm}>
              Clear (new)
            </button>
          </p>
        ) : null}
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Title</div>
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
          />
        </label>
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Body</div>
          <textarea
            required
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={5}
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
          <label className="text-sm flex items-end gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <span>Active</span>
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-sm">
            <div className="opacity-70 mb-1">Min app version</div>
            <input
              value={form.min_app_version}
              onChange={(e) => setForm((f) => ({ ...f, min_app_version: e.target.value }))}
              placeholder="1.0.0"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="text-sm">
            <div className="opacity-70 mb-1">Max app version</div>
            <input
              value={form.max_app_version}
              onChange={(e) => setForm((f) => ({ ...f, max_app_version: e.target.value }))}
              placeholder="2.9.9"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-sm">
            <div className="opacity-70 mb-1">Starts (local)</div>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="text-sm">
            <div className="opacity-70 mb-1">Ends (local)</div>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" />
          </label>
          <label className="text-sm">
            <div className="opacity-70 mb-1">Priority</div>
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
        >
          {saving ? "Saving…" : "Save entry"}
        </button>
      </form>

      <div className="rounded-xl border border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/80 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-2">Title</th>
                <th className="p-2">Body</th>
                <th className="p-2">Platform</th>
                <th className="p-2">Active</th>
                <th className="p-2">Versions</th>
                <th className="p-2">Schedule</th>
                <th className="p-2">Pri</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-4 text-neutral-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-neutral-500">
                    No rows.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-800">
                    <td className="p-2 align-top font-medium">{r.title}</td>
                    <td className="p-2 align-top text-neutral-400 max-w-xs truncate">{r.body}</td>
                    <td className="p-2 align-top">{r.platform}</td>
                    <td className="p-2 align-top">{r.is_active ? "yes" : "no"}</td>
                    <td className="p-2 align-top text-xs font-mono">
                      {r.min_app_version || "—"} → {r.max_app_version || "—"}
                    </td>
                    <td className="p-2 align-top text-xs text-neutral-500 whitespace-nowrap">
                      {r.starts_at ? new Date(r.starts_at).toLocaleString() : "—"} —{" "}
                      {r.ends_at ? new Date(r.ends_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 align-top">{r.priority}</td>
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
