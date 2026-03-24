"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type PromptKind = "chat" | "deck_analysis";
type TierOverlay = "guest" | "free" | "pro";

type OverlaysState = Record<TierOverlay, string>;

/** Layer keys used by composeSystemPrompt — live AI reads prompt_layers, not prompt_versions. */
const LAYER_KEY_BY_KIND: Record<PromptKind, string> = {
  chat: "BASE_UNIVERSAL_ENFORCEMENT",
  deck_analysis: "DECK_ANALYSIS_EXEMPLARS",
};

type LayerMeta = { key: string; updated_at?: string | null; meta?: Record<string, unknown> };

export default function PromptEditPage() {
  const [baseChat, setBaseChat] = useState("");
  const [baseDeckAnalysis, setBaseDeckAnalysis] = useState("");
  const [layerMeta, setLayerMeta] = useState<Record<PromptKind, LayerMeta | null>>({
    chat: null,
    deck_analysis: null,
  });
  const [overlays, setOverlays] = useState<OverlaysState>({ guest: "", free: "", pro: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<PromptKind>("chat");

  const loadBasePrompts = useCallback(async () => {
    try {
      const kChat = encodeURIComponent(LAYER_KEY_BY_KIND.chat);
      const kDeck = encodeURIComponent(LAYER_KEY_BY_KIND.deck_analysis);
      const [chatRes, deckRes] = await Promise.all([
        fetch(`/api/admin/prompt-layers?key=${kChat}`, { cache: "no-store" }),
        fetch(`/api/admin/prompt-layers?key=${kDeck}`, { cache: "no-store" }),
      ]);
      const chatData = await chatRes.json();
      const deckData = await deckRes.json();
      if (chatRes.ok && chatData?.ok) {
        setBaseChat(typeof chatData.body === "string" ? chatData.body : "");
        setLayerMeta((m) => ({
          ...m,
          chat: {
            key: chatData.key ?? LAYER_KEY_BY_KIND.chat,
            updated_at: chatData.updated_at,
            meta: chatData.meta && typeof chatData.meta === "object" ? (chatData.meta as Record<string, unknown>) : {},
          },
        }));
      } else {
        setBaseChat("");
        setLayerMeta((m) => ({ ...m, chat: null }));
        if (chatRes.status !== 404) console.warn("[prompt-edit] load chat layer:", chatData?.error || chatRes.status);
      }
      if (deckRes.ok && deckData?.ok) {
        setBaseDeckAnalysis(typeof deckData.body === "string" ? deckData.body : "");
        setLayerMeta((m) => ({
          ...m,
          deck_analysis: {
            key: deckData.key ?? LAYER_KEY_BY_KIND.deck_analysis,
            updated_at: deckData.updated_at,
            meta: deckData.meta && typeof deckData.meta === "object" ? (deckData.meta as Record<string, unknown>) : {},
          },
        }));
      } else {
        setBaseDeckAnalysis("");
        setLayerMeta((m) => ({ ...m, deck_analysis: null }));
        if (deckRes.status !== 404) console.warn("[prompt-edit] load deck layer:", deckData?.error || deckRes.status);
      }
      console.info("[prompt-edit] reads/writes table prompt_layers (production composeSystemPrompt)", LAYER_KEY_BY_KIND);
    } catch (e) {
      console.error("Failed to load base prompts:", e);
    }
  }, []);

  const loadOverlays = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/tier-overlays", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && j.overlays) setOverlays(j.overlays);
    } catch (e) {
      console.error("Failed to load overlays:", e);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadBasePrompts(), loadOverlays()]);
      setLoading(false);
    };
    load();
  }, [loadBasePrompts, loadOverlays]);

  async function saveBasePrompt(kind: PromptKind) {
    const text = kind === "chat" ? baseChat : baseDeckAnalysis;
    if (!text.trim()) {
      alert("Prompt text cannot be empty");
      return;
    }
    const layerKey = LAYER_KEY_BY_KIND[kind];
    if (!confirm(`Save to table prompt_layers, key ${layerKey}? This is what composeSystemPrompt uses in production.`)) return;
    setSaving(`base_${kind}`);
    const prevMeta = layerMeta[kind]?.meta ?? {};
    try {
      const r = await fetch("/api/admin/prompt-layers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: layerKey,
          body: text,
          meta: { ...prevMeta, source: "admin_prompt_edit" },
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setLayerMeta((m) => ({
          ...m,
          [kind]: { key: j.key ?? layerKey, updated_at: j.updated_at },
        }));
        alert(`✅ Saved prompt_layers · ${j.key ?? layerKey} (updated_at: ${j.updated_at ?? "—"})`);
        await loadBasePrompts();
      } else {
        alert(`Failed: ${j.error}`);
      }
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setSaving(null);
    }
  }

  async function saveOverlay(tier: TierOverlay) {
    setSaving(`overlay_${tier}`);
    try {
      const r = await fetch("/api/admin/tier-overlays", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, body: overlays[tier] }),
      });
      const j = await r.json();
      if (j.ok) {
        alert(`✅ Saved ${tier} overlay`);
        await loadOverlays();
      } else {
        alert(`Failed: ${j.error}`);
      }
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-neutral-400">Loading prompts…</p>
      </div>
    );
  }

  const baseText = activeKind === "chat" ? baseChat : baseDeckAnalysis;
  const setBaseText = activeKind === "chat" ? setBaseChat : setBaseDeckAnalysis;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Prompt Edit</h1>
          <p className="text-sm text-neutral-400">
            Edit base prompts (chat / deck analysis) and tier overlays (guest / free / pro). Base prompts are stored in{" "}
            <code className="bg-neutral-800 px-1 rounded">prompt_layers</code> (same table as production composeSystemPrompt).
          </p>
        </div>
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
          ← Admin
        </Link>
      </div>

      {/* Base prompts */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="font-medium">Base Prompts</h2>
        <p className="text-xs text-neutral-500">
          <span className="text-amber-200/90">Storage:</span> table{" "}
          <code className="bg-neutral-800 px-1 rounded">prompt_layers</code> (live — no prompt_versions fallback). Chat tab ={" "}
          <code className="bg-neutral-800 px-1 rounded">BASE_UNIVERSAL_ENFORCEMENT</code>; Deck Analysis tab ={" "}
          <code className="bg-neutral-800 px-1 rounded">DECK_ANALYSIS_EXEMPLARS</code> (appended only for deck-analysis requests).
        </p>
        {layerMeta[activeKind] && (
          <p className="text-[11px] text-neutral-400 font-mono">
            Active key: {layerMeta[activeKind]!.key}
            {layerMeta[activeKind]!.updated_at ? ` · updated_at ${layerMeta[activeKind]!.updated_at}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          {(["chat", "deck_analysis"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setActiveKind(k)}
              className={`px-3 py-1.5 rounded text-sm font-medium capitalize ${activeKind === k ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"}`}
            >
              {k === "deck_analysis" ? "Deck Analysis" : k}
            </button>
          ))}
          <span className="text-[11px] text-neutral-500">
            {activeKind === "chat" ? `→ ${LAYER_KEY_BY_KIND.chat}` : `→ ${LAYER_KEY_BY_KIND.deck_analysis}`}
          </span>
        </div>
        <div>
          <label className="text-xs opacity-70 block mb-1">Prompt text</label>
          <textarea
            value={baseText}
            onChange={(e) => setBaseText(e.target.value)}
            className="w-full h-64 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm font-mono"
            style={{ fontFamily: "monospace", fontSize: "11px", lineHeight: "1.4" }}
            placeholder="Base system prompt..."
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-neutral-500">{baseText.length} characters</span>
            <button
              onClick={() => saveBasePrompt(activeKind)}
              disabled={!!saving || !baseText.trim()}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {saving === `base_${activeKind}` ? "Saving…" : "Save to prompt_layers"}
            </button>
          </div>
        </div>
      </section>

      {/* Tier overlays */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-4">
        <h2 className="font-medium">Tier Overlays (Guest / Free / Pro)</h2>
        <p className="text-xs text-neutral-500">
          Stored in <code className="bg-neutral-800 px-1 rounded">app_config</code>. Appended after user level instruction. Empty = use hardcoded default.
        </p>
        {(["guest", "free", "pro"] as const).map((tier) => (
          <div key={tier} className="border border-neutral-700 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium capitalize">{tier} overlay</label>
              <button
                onClick={() => saveOverlay(tier)}
                disabled={!!saving}
                className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-xs"
              >
                {saving === `overlay_${tier}` ? "Saving…" : "Save"}
              </button>
            </div>
            <textarea
              value={overlays[tier]}
              onChange={(e) => setOverlays((prev) => ({ ...prev, [tier]: e.target.value }))}
              className="w-full h-28 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs font-mono"
              placeholder={`${tier} tier overlay (leave empty to use default)`}
            />
            <p className="text-[11px] text-neutral-500">{overlays[tier].length} characters</p>
          </div>
        ))}
      </section>
    </main>
  );
}
