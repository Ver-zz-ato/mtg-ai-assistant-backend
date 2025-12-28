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

// Seed messages to make shoutbox feel more active (natural, casual tone)
const seedMessages: Shout[] = [
  { id: -1, user: "jake_mtg", text: "yo this deck analyzer is actually pretty sick", ts: Date.now() - (2 * 24 * 60 * 60 * 1000) },
  { id: -2, user: "sarah", text: "can you export to moxfield?", ts: Date.now() - (1.5 * 24 * 60 * 60 * 1000) },
  { id: -3, user: "mike", text: "saved like $200 using the cost tracker thing", ts: Date.now() - (1 * 24 * 60 * 60 * 1000) },
  { id: -4, user: "alex", text: "budget edh tips anyone?", ts: Date.now() - (12 * 60 * 60 * 1000) },
  { id: -5, user: "chris", text: "first time here, seems cool", ts: Date.now() - (6 * 60 * 60 * 1000) },
];

const store =
  globalThis.__shoutStore ??
  (globalThis.__shoutStore = {
    clients: new Set<WritableStreamDefaultWriter<Uint8Array>>(),
    history: seedMessages.length > 0 ? [...seedMessages] : [],
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
