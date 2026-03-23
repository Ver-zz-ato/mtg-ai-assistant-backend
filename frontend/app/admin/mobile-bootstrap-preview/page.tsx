"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";

export default function AdminMobileBootstrapPreviewPage() {
  const [platform, setPlatform] = React.useState("android");
  const [version, setVersion] = React.useState("");
  const [json, setJson] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      params.set("platform", platform);
      if (version.trim()) params.set("version", version.trim());
      const r = await fetch(`/api/admin/mobile/bootstrap-preview?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || r.statusText);
      setJson(JSON.stringify(j, null, 2));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "load failed");
      setJson("");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copy() {
    if (!json) return;
    void navigator.clipboard.writeText(json);
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Mobile Bootstrap Preview</h1>
      <ELI5
        heading="Bootstrap preview"
        items={[
          "Same payload as GET /api/mobile/bootstrap (uses shared server assembly).",
          "Use platform + optional version to debug filtering.",
        ]}
      />

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          <div className="opacity-70 mb-1">Platform</div>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
          >
            {["ios", "android", "mobile", "all", "web"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">App version (optional)</div>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.3"
            className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 font-mono text-xs w-32"
          />
        </label>
        <button
          type="button"
          onClick={() => load()}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={!json}
          className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50"
        >
          Copy JSON
        </button>
      </div>

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <pre className="text-xs font-mono bg-neutral-950 border border-neutral-700 rounded p-3 overflow-x-auto max-h-[70vh] overflow-y-auto">
          {json || "{}"}
        </pre>
      )}
    </div>
  );
}
