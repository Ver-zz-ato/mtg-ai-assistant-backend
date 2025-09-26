
// components/Chat.tsx.add-this.ts
// NOTE: Do not overwrite your whole Chat.tsx. Integrate this call sequence:
/*
import { postMessage } from "@/lib/threads";

async function sendMessage(flow: { threadId?: string; deckId?: string; content: string }) {
  // 1) persist user message
  const persisted = await postMessage({ threadId: flow.threadId, role: "user", content: flow.content, deckId: flow.deckId });
  if (!persisted.ok) throw new Error(persisted.error);
  const tid = persisted.data.threadId;

  // 2) call your existing GPT endpoint with full message history (or last message)
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId: tid, prompt: flow.content })
  });
  const data = await res.json(); // ensure .json() not .text()

  const assistantText = data?.text ?? data?.message ?? "";
  if (assistantText) {
    // 3) persist assistant reply
    const persisted2 = await postMessage({ threadId: tid, role: "assistant", content: assistantText });
    if (!persisted2.ok) console.warn("Failed to persist assistant message:", persisted2.error);
  }

  return { threadId: tid, assistantText };
}
*/
