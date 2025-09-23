// Canonical client helpers for chat threads/messages
// All functions return unified envelopes from the server.

async function j(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${text}`);
  }
  return res.json();
}

// Threads
export async function listThreads(signal?: AbortSignal): Promise<any> {
  return j(await fetch("/api/chat/threads/list", { cache: "no-store", signal } as RequestInit));
}

export async function createThread(title?: string): Promise<any> {
  return j(
    await fetch("/api/chat/threads/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    } as RequestInit),
  );
}

export async function renameThread(id: string, title: string): Promise<any> {
  return j(
    await fetch("/api/chat/threads/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    } as RequestInit),
  );
}

export async function deleteThread(id: string): Promise<any> {
  return j(
    await fetch("/api/chat/threads/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    } as RequestInit),
  );
}

export async function linkThread(threadId: string, deckId: string | null): Promise<any> {
  return j(
    await fetch("/api/chat/threads/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, deckId: deckId && deckId.trim() ? deckId.trim() : null }),
    } as RequestInit),
  );
}

// Messages
export async function listMessages(threadId: string, signal?: AbortSignal): Promise<any> {
  const qs = new URLSearchParams({ threadId });
  return j(
    await fetch(`/api/chat/messages/list?${qs.toString()}`, {
      cache: "no-store",
      signal,
    } as RequestInit),
  );
}

export async function postMessage(content: string, threadId?: string | null): Promise<any> {
  return j(
    await fetch("/api/chat/messages/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content, threadId }),
    } as RequestInit),
  );
}

// Import / Export
export async function exportThread(threadId: string): Promise<void> {
  const res = await fetch("/api/chat/threads/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId }),
  } as RequestInit);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed: ${res.status} ${res.statusText} ${text}`);
  }
  const text = await res.text();
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thread-${threadId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importThread(payload: {
  title: string;
  messages: { role: "user" | "assistant" | "system"; content: string; created_at?: string }[];
  deckId?: string | null;
}): Promise<any> {
  return j(
    await fetch("/api/chat/threads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    } as RequestInit),
  );
}
