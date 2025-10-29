// NOTE: This is a targeted patch: only the send-message logic is shown here to make the diff small.
// You can splice this handler into your existing components/Chat.tsx, or replace the whole file if you prefer.
// The rest of your component structure remains unchanged.
import React from 'react';
import { toast } from '@/lib/toast-client';

type Props = {
  getActiveThreadId: () => string | null;
  onAssistant: (text: string) => void;
  onThreadEnsured?: (id: string) => void;
};

export default function ChatSendHotfix({ getActiveThreadId, onAssistant, onThreadEnsured }: Props) {
  const [pending, setPending] = React.useState(false);
  const [text, setText] = React.useState('');

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const raw = (text || '').trim();
    if (!raw || pending) return;
    setPending(true);

    try {
      // 1) Save the user message (also creates thread if needed)
      const saveBody: any = { threadId: getActiveThreadId(), content: raw };
      const saveRes = await fetch('/api/chat/messages/post', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(saveBody),
      });
      const saveText = await saveRes.text();
      let saveJson: any = null;
      try { saveJson = JSON.parse(saveText); } catch {}
      // Pull threadId from dropdown or response (varies by server envelope)
      let threadId: string | null = getActiveThreadId();
      threadId = threadId || saveJson?.thread?.id || saveJson?.id || saveJson?.data?.threadId || null;
      if (!threadId && typeof saveJson === 'object') {
        // sometimes servers return { ok: true, thread: { id } }
        threadId = saveJson?.thread?.id ?? null;
      }
      if (typeof onThreadEnsured === 'function' && threadId) onThreadEnsured(threadId);

      if (!saveRes.ok) {
        console.error('[chat hotfix] /post failed', saveRes.status, saveText);
        toast(saveJson?.error?.message || 'Failed to send message', 'error');
        return;
      }

      // 2) Trigger assistant generation. Different servers expect 'message' or 'content'.
      const genBody = { threadId, message: raw, content: raw };
      const genRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(genBody),
      });
      const genText = await genRes.text();
      let genJson: any = null;
      try { genJson = JSON.parse(genText); } catch {}

      if (!genRes.ok) {
        console.error('[chat hotfix] /api/chat failed', genRes.status, genText);
        alert(genJson?.error?.message || 'Assistant failed');
        return;
      }

      // Accept either a structured envelope or plain text
      const reply =
        (genJson && (genJson.reply?.content || genJson.assistant?.content || genJson.message || genJson.content))
        || (typeof genText === 'string' ? genText : '');

      if (reply && typeof onAssistant === 'function') onAssistant(String(reply));
    } finally {
      setPending(false);
      setText('');
    }
  }

  return (
    <form onSubmit={send} className="flex gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask anything or paste a decklist... (Shift+Enter for newline)"
        className="flex-1 rounded border bg-zinc-900 p-2 text-sm"
      />
      <button type="submit" disabled={pending} className="rounded bg-blue-600 px-4 py-2">
        {pending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
