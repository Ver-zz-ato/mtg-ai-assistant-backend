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
    // Try to show a toast if we're in the browser (skip for auth errors)
    try {
      if (typeof window !== 'undefined' && 
          !friendly.toLowerCase().includes('auth session missing') && 
          !friendly.toLowerCase().includes('invalid refresh token') &&
          !friendly.toLowerCase().includes('http 401')) {
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
        const errorMsg = (json as any)?.error?.message || "Request failed";
        // Skip auth error toasts for guests
        if (!errorMsg.toLowerCase().includes('auth session missing') && 
            !errorMsg.toLowerCase().includes('invalid refresh token') &&
            !errorMsg.toLowerCase().includes('http 401')) {
          const mod = await import("@/lib/toast-client");
          mod.toastError?.(errorMsg);
        }
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
  const res = await fetch(`/api/chat/messages/list?${qs.toString()}`, { cache: "no-store", signal } as RequestInit);
  if (res.status === 401) {
    // Not signed in — return empty silently to avoid noisy errors for guests
    return { messages: [] };
  }
  const r = await j(res);
  const messages = (r as any)?.messages ?? (r as any)?.data ?? [];
  return { messages };
}

// Backward-compatible: accept either (payload) or (text, threadId)
export async function postMessage(
  payloadOrText: { text: string; threadId?: string | null; stream?: boolean; context?: any; prefs?: any; guestMessageCount?: number } | string,
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

// New streaming function with ChatGPT-like speed using client-side pacer
export async function postMessageStream(
  payload: { text: string; threadId?: string | null; context?: any; prefs?: any; guestMessageCount?: number },
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  // Import the StreamingPacer dynamically to avoid server-side issues
  const { StreamingPacer } = await import('./streaming-pacer');
  
  const pacer = new StreamingPacer({
    tokensPerSecond: 25, // ChatGPT-like speed
    onUpdate: (incrementalText: string, isComplete: boolean) => {
      if (incrementalText) {
        onToken(incrementalText);
      }
      if (isComplete) {
        onDone();
      }
    },
    onError: (error: Error) => {
      onError(error);
    }
  });
  
  const doFetch = (): Promise<Response> =>
    fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal
    });

  let response = await doFetch();
  if (response.status === 405) {
    response = await doFetch();
  }
  if (response.status === 405) {
    throw new Error("Chat request was rejected (405). Please refresh the page and try again.");
  }

  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        const json = await response.json();
        if (json.guestLimitReached) {
          throw new Error('guest_limit_exceeded');
        }
        if (json.fallback) {
          throw new Error(json.message || "fallback");
        }
        throw new Error(json.message || `HTTP ${response.status}`);
      } catch (e) {
        if (e instanceof Error && e.message === 'guest_limit_exceeded') {
          throw e;
        }
        if (e instanceof Error && e.message === 'fallback') {
          throw e;
        }
        throw new Error(`HTTP ${response.status}`);
      }
    }

    if (!response.ok) {
      const msg = response.status === 405
        ? "Chat request was rejected (405). Please refresh the page and try again."
        : `HTTP ${response.status}`;
      throw new Error(msg);
    }

    if (!response.body) {
      throw new Error("No response stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      
      // Check for completion signal
      if (chunk.includes("[DONE]")) {
        const beforeDone = chunk.split("[DONE]")[0];
        if (beforeDone) {
          fullResponse += beforeDone;
          pacer.addChunk(beforeDone);
        }
        // Signal completion to pacer
        pacer.complete();
        return;
      }
      
      // Filter out heartbeat spaces and add to pacer
      const filtered = chunk.replace(/^\s+$/, "");
      if (filtered) {
        fullResponse += filtered;
        pacer.addChunk(filtered);
      }
    }

    // If we reach here without [DONE], complete anyway
    pacer.complete();
  } catch (error: any) {
    pacer.stop();
    if (error.name === 'AbortError') {
      onDone(); // Treat abort as completion
    } else {
      onError(error);
    }
  }
}
