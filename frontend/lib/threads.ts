// Canonical client helpers for chat threads/messages
// All functions return unified envelopes from the server.

type Envelope<T = any> =
  | ({ ok: true } & T)
  | ({ ok: false } & { error: { code?: string; message: string; hint?: string } });

async function j(res: Response): Promise<Envelope> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let friendly = text || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text || "{}");
      const msg = j?.error?.message || j?.message;
      const hint = j?.error?.hint || j?.hint;
      if (msg) friendly = hint ? `${msg} (${hint})` : msg;
    } catch {}
    // Try to show a toast if we're in the browser
    try {
      if (typeof window !== 'undefined') {
        const mod = await import("@/lib/toast-client");
        mod.toastError?.(friendly);
      }
    } catch {}
    throw new Error(friendly);
  }
  const json = await res.json().catch(() => ({} as any));
  if ((json as any)?.ok === false) {
    try {
      if (typeof window !== 'undefined') {
        const mod = await import("@/lib/toast-client");
        mod.toastError?.((json as any)?.error?.message || "Request failed");
      }
    } catch {}
  }
  return json as Envelope;
}

// ───────────────────────────────────────────────────────────────────────────────
// Threads
// ───────────────────────────────────────────────────────────────────────────────

export async function listThreads(signal?: AbortSignal): Promise<{ threads: any[] }> {
  const res = await fetch("/api/chat/threads/list", { cache: "no-store", signal } as RequestInit);
  if (res.status === 401) {
    // Not signed in — return empty silently to avoid noisy toasts on homepage
    return { threads: [] };
  }
  const r = await j(res);
  const threads = (r as any)?.threads ?? (r as any)?.data ?? [];
  return { threads };
}

export async function renameThread(threadId: string, title: string): Promise<Envelope<{}>> {
  return j(
    await fetch("/api/chat/threads/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, title }),
    } as RequestInit),
  );
}

export async function deleteThread(threadId: string): Promise<Envelope<{}>> {
  return j(
    await fetch("/api/chat/threads/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    } as RequestInit),
  );
}

export async function linkThread(threadId: string, deckId: string | null): Promise<Envelope<{}>> {
  return j(
    await fetch("/api/chat/threads/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, deckId }),
    } as RequestInit),
  );
}

export async function exportThread(threadId: string): Promise<Envelope<{ export: any }>> {
  return j(
    await fetch("/api/chat/threads/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    } as RequestInit),
  );
}

export async function importThread(payload: {
  title: string;
  messages: { role: "user" | "assistant" | "system"; content: string; created_at?: string }[];
  deckId?: string | null;
}): Promise<Envelope<{}>> {
  return j(
    await fetch("/api/chat/threads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    } as RequestInit),
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Messages
// ───────────────────────────────────────────────────────────────────────────────

export async function listMessages(threadId: string, signal?: AbortSignal): Promise<{ messages: any[] }> {
  const qs = new URLSearchParams({ threadId });
  const r = await j(await fetch(`/api/chat/messages/list?${qs.toString()}`, { cache: "no-store", signal } as RequestInit));
  const messages = (r as any)?.messages ?? (r as any)?.data ?? [];
  return { messages };
}

// Backward-compatible: accept either (payload) or (text, threadId)
export async function postMessage(
  payloadOrText: { text: string; threadId?: string | null; stream?: boolean; context?: any; prefs?: any } | string,
  maybeThreadId?: string | null,
): Promise<Envelope<{ id?: string }>> {
  const payload = typeof payloadOrText === "string"
    ? { text: payloadOrText, threadId: maybeThreadId ?? null }
    : payloadOrText;
  return j(
    await fetch("/api/chat/messages/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    } as RequestInit),
  );
}
