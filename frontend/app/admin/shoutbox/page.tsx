"use client";
import { useState, useEffect, useCallback } from "react";

type Message = {
  id: number;
  user_name: string;
  message_text: string;
  is_ai_generated: boolean;
  created_at: string;
};

type BannedUser = {
  id: string;
  user_name: string;
  banned_at: string;
  banned_by: string | null;
  reason: string | null;
};

type Stats = {
  total: number;
  ai: number;
  real: number;
  banned: number;
};

export default function AdminShoutboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, ai: 0, real: 0, banned: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [aiOnly, setAiOnly] = useState(false);
  const [showBanned, setShowBanned] = useState(false);
  const [banInput, setBanInput] = useState("");
  const [banReason, setBanReason] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/shoutbox?limit=100&ai_only=${aiOnly}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setStats(data.stats || { total: 0, ai: 0, real: 0, banned: 0 });
      }
    } catch (e) {
      console.error("Failed to fetch messages:", e);
    } finally {
      setLoading(false);
    }
  }, [aiOnly]);

  const fetchBanned = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shoutbox/ban");
      if (res.ok) {
        const data = await res.json();
        setBannedUsers(data.banned || []);
      }
    } catch (e) {
      console.error("Failed to fetch banned users:", e);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchBanned();
  }, [fetchMessages, fetchBanned]);

  function toggleSelect(id: number) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  }

  function selectAll() {
    setSelectedIds(new Set(messages.map((m) => m.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} message(s)?`)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/shoutbox", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchMessages();
      }
    } catch (e) {
      alert("Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  async function banUser(userName: string, reason?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/shoutbox/ban", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userName, reason }),
      });
      if (res.ok) {
        setBanInput("");
        setBanReason("");
        fetchBanned();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to ban");
      }
    } catch (e) {
      alert("Failed to ban");
    } finally {
      setBusy(false);
    }
  }

  async function unbanUser(userName: string) {
    if (!confirm(`Unban ${userName}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/shoutbox/ban", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userName }),
      });
      if (res.ok) {
        fetchBanned();
      }
    } catch (e) {
      alert("Failed to unban");
    } finally {
      setBusy(false);
    }
  }

  async function triggerAI() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/shoutbox/trigger-ai", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Generated ${data.count || 0} message(s) via ${data.method || "unknown"}`);
        fetchMessages();
      } else {
        alert(data.error || "Failed to trigger AI");
      }
    } catch (e) {
      alert("Failed to trigger AI");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Shoutbox Admin</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-3 rounded bg-neutral-800 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-neutral-400">Total Messages</div>
        </div>
        <div className="p-3 rounded bg-neutral-800 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.ai}</div>
          <div className="text-xs text-neutral-400">AI Generated</div>
        </div>
        <div className="p-3 rounded bg-neutral-800 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.real}</div>
          <div className="text-xs text-neutral-400">Real Users</div>
        </div>
        <div className="p-3 rounded bg-neutral-800 text-center">
          <div className="text-2xl font-bold text-red-400">{stats.banned}</div>
          <div className="text-xs text-neutral-400">Banned Users</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={triggerAI}
          disabled={busy}
          className="px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
        >
          Trigger AI Generation
        </button>
        <button
          onClick={() => setAiOnly(!aiOnly)}
          className={`px-4 py-2 rounded ${aiOnly ? "bg-blue-600" : "bg-neutral-700"}`}
        >
          {aiOnly ? "Showing AI Only" : "Show All"}
        </button>
        <button
          onClick={() => setShowBanned(!showBanned)}
          className={`px-4 py-2 rounded ${showBanned ? "bg-red-600" : "bg-neutral-700"}`}
        >
          {showBanned ? "Hide Banned" : "Show Banned Users"}
        </button>
      </div>

      {/* Banned Users Panel */}
      {showBanned && (
        <div className="mb-6 p-4 rounded border border-neutral-700 bg-neutral-900">
          <h2 className="font-semibold mb-3">Banned Users ({bannedUsers.length})</h2>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={banInput}
              onChange={(e) => setBanInput(e.target.value)}
              placeholder="Username to ban"
              className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 flex-1"
            />
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason (optional)"
              className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 flex-1"
            />
            <button
              onClick={() => banUser(banInput, banReason)}
              disabled={busy || !banInput.trim()}
              className="px-4 py-1 rounded bg-red-600 text-white disabled:opacity-50"
            >
              Ban
            </button>
          </div>

          {bannedUsers.length === 0 ? (
            <div className="text-neutral-400 text-sm">No banned users</div>
          ) : (
            <div className="space-y-2">
              {bannedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2 rounded bg-neutral-800"
                >
                  <div>
                    <span className="font-medium">{u.user_name}</span>
                    {u.reason && (
                      <span className="text-sm text-neutral-400 ml-2">
                        ({u.reason})
                      </span>
                    )}
                    <span className="text-xs text-neutral-500 ml-2">
                      {new Date(u.banned_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => unbanUser(u.user_name)}
                    disabled={busy}
                    className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex gap-2 mb-4 p-2 rounded bg-neutral-800">
          <span className="text-sm">{selectedIds.size} selected</span>
          <button
            onClick={deleteSelected}
            disabled={busy}
            className="px-3 py-1 rounded bg-red-600 text-white text-sm"
          >
            Delete Selected
          </button>
          <button onClick={clearSelection} className="px-3 py-1 rounded bg-neutral-700 text-sm">
            Clear
          </button>
        </div>
      )}

      {/* Messages Table */}
      {loading ? (
        <div className="text-neutral-400">Loading...</div>
      ) : messages.length === 0 ? (
        <div className="text-neutral-400">No messages found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700">
                <th className="p-2 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === messages.length && messages.length > 0}
                    onChange={() =>
                      selectedIds.size === messages.length ? clearSelection() : selectAll()
                    }
                  />
                </th>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">User</th>
                <th className="p-2 text-left">Message</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Time</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b border-neutral-800 hover:bg-neutral-800/50 ${
                    selectedIds.has(m.id) ? "bg-neutral-800" : ""
                  }`}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                    />
                  </td>
                  <td className="p-2 font-mono text-xs">{m.id}</td>
                  <td className="p-2">{m.user_name}</td>
                  <td className="p-2 max-w-xs truncate">{m.message_text}</td>
                  <td className="p-2">
                    {m.is_ai_generated ? (
                      <span className="px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 text-xs">
                        AI
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-green-600/30 text-green-300 text-xs">
                        Real
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs text-neutral-400">
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setSelectedIds(new Set([m.id]));
                          deleteSelected();
                        }}
                        className="px-2 py-1 rounded bg-red-600/50 hover:bg-red-600 text-xs"
                      >
                        Del
                      </button>
                      <button
                        onClick={() => banUser(m.user_name)}
                        className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
                      >
                        Ban
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
