import { ChatThread, ChatMessage } from "@/types/chat";

async function j<T = any>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!("ok" in data)) throw new Error("Bad response shape");
  if (!data.ok) throw new Error(data.error?.message ?? "Request failed");
  return data as T;
}

export async function listThreads() {
  return j<{ ok: true; threads: ChatThread[] }>(
    await fetch("/api/chat/threads/list", { cache: "no-store" })
  );
}

export async function createThread(title?: string, deckId?: string | null) {
  return j<{ ok: true; id: string }>(
    await fetch("/api/chat/threads/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, deckId }),
    })
  );
}

export async function renameThread(threadId: string, title: string) {
  return j<{ ok: true }>(
    await fetch("/api/chat/threads/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, title }),
    })
  );
}

export async function deleteThread(threadId: string) {
  return j<{ ok: true }>(
    await fetch("/api/chat/threads/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId }),
    })
  );
}

export async function linkThread(threadId: string, deckId: string | null) {
  return j<{ ok: true }>(
    await fetch("/api/chat/threads/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, deckId }),
    })
  );
}

export async function exportThread(threadId: string) {
  return j<{ ok: true; export: { thread: ChatThread; messages: Pick<ChatMessage, "role" | "content" | "created_at">[] } }>(
    await fetch("/api/chat/threads/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId }),
    })
  );
}

export async function importThread(payload: { title: string; messages: Pick<ChatMessage, "role" | "content" | "created_at">[]; deckId?: string | null }) {
  return j<{ ok: true; id: string }>(
    await fetch("/api/chat/threads/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function listMessages(threadId: string) {
  const params = new URLSearchParams({ threadId });
  return j<{ ok: true; messages: ChatMessage[] }>(
    await fetch(`/api/chat/messages/list?${params.toString()}`, { cache: "no-store" })
  );
}

export async function postMessage(text: string, threadId?: string | null) {
  return j<{ ok: true; text: string; threadId: string }>(
    await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, threadId }),
    })
  );
}
