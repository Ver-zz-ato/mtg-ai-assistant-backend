'use client';
import { useState } from 'react';

export default function FeedbackFab() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [msg, setMsg] = useState<string>('');

  async function submit() {
    setMsg('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating === '' ? undefined : Number(rating), text, email: email || undefined })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || res.statusText);
      setMsg(json.stored ? 'Thanks! Sent.' : 'Thanks! (logged only on server)');
      setText('');
      setEmail('');
      setRating('');
      setOpen(false);
    } catch (e:any) {
      setMsg(e?.message || 'Failed to send');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 bottom-3 z-40 rounded-full px-4 py-2 bg-black/70 border border-white/15 shadow-md text-sm"
      >
        Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Send feedback</h3>
              <button className="opacity-70 hover:opacity-100" onClick={()=>setOpen(false)}>✕</button>
            </div>
            <div className="space-y-3">
              <textarea
                className="w-full h-28 bg-black/30 border border-white/10 rounded p-2 text-sm"
                placeholder="What’s confusing? What broke? What would you love to see?"
                value={text} onChange={e=>setText(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="col-span-2 bg-black/30 border border-white/10 rounded p-2 text-sm"
                  placeholder="Email (optional)"
                  value={email} onChange={e=>setEmail(e.target.value)}
                />
                <input
                  className="bg-black/30 border border-white/10 rounded p-2 text-sm"
                  placeholder="Rating (1–5)"
                  value={rating}
                  onChange={e=>{
                    const v = e.target.value.trim();
                    if (!v) setRating('');
                    else setRating(Number(v));
                  }}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-2 border border-white/15 rounded" onClick={()=>setOpen(false)}>Cancel</button>
                <button
                  className="px-3 py-2 border border-white/15 rounded bg-white/5 disabled:opacity-50"
                  onClick={submit} disabled={!text.trim()}>
                  Send
                </button>
              </div>
              {msg && <div className="text-xs opacity-80">{msg}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
