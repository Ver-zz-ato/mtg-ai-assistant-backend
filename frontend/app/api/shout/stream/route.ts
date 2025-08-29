// Live SSE stream of shoutbox messages
type Shout = { id: number; user: string; text: string; ts: number };

declare global {
  // eslint-disable-next-line no-var
  var __shoutStore:
    | { clients: Set<WritableStreamDefaultWriter<Uint8Array>>; history: Shout[]; nextId: number }
    | undefined;
}

const store =
  globalThis.__shoutStore ??
  (globalThis.__shoutStore = { clients: new Set<WritableStreamDefaultWriter<Uint8Array>>(), history: [], nextId: 1 });

export async function GET(req: Request) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  store.clients.add(writer);

  const enc = new TextEncoder();
  const write = (s: string) => writer.write(enc.encode(s));

  // heartbeat so proxies keep the connection open
  const ping = setInterval(() => {
    write(`: ping\n\n`).catch(() => {});
  }, 30000);

  // remove client on disconnect
  (req as any)?.signal?.addEventListener("abort", () => {
    clearInterval(ping);
    store.clients.delete(writer);
    writer.close().catch(() => {});
  });

  // optional: greet (client will fetch history separately)
  write(`event: hello\ndata: "ok"\n\n`);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// helper to broadcast to all clients
export function broadcast(msg: Shout) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  const enc = new TextEncoder();
  const bytes = enc.encode(payload);

  for (const w of Array.from(store.clients)) {
    w.write(bytes).catch(() => {
      // drop broken clients
      store.clients.delete(w);
    });
  }
}

// helper to store message (keep last 100)
export function pushHistory(msg: Shout) {
  store.history.push(msg);
  if (store.history.length > 100) store.history.shift();
}

export function getHistory() {
  return store.history;
}
