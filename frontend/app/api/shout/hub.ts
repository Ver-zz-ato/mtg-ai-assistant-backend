// Shared in-memory hub for the shoutbox (SSE)
export type Shout = { id: number; user: string; text: string; ts: number };

declare global {
  var __shoutStore:
    | {
        clients: Set<WritableStreamDefaultWriter<Uint8Array>>;
        history: Shout[];
        nextId: number;
      }
    | undefined;
}

const store =
  globalThis.__shoutStore ??
  (globalThis.__shoutStore = {
    clients: new Set<WritableStreamDefaultWriter<Uint8Array>>(),
    history: [],
    nextId: 1,
  });

export function addClient(writer: WritableStreamDefaultWriter<Uint8Array>) {
  store.clients.add(writer);
}

export function removeClient(writer: WritableStreamDefaultWriter<Uint8Array>) {
  store.clients.delete(writer);
}

export function broadcast(msg: Shout) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  const bytes = new TextEncoder().encode(payload);
  for (const w of Array.from(store.clients)) {
    w.write(bytes).catch(() => {
      store.clients.delete(w);
    });
  }
}

export function pushHistory(msg: Shout) {
  store.history.push(msg);
  if (store.history.length > 100) store.history.shift();
}

export function getHistory() {
  return store.history;
}
