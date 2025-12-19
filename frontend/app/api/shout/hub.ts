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

// Seed messages to make shoutbox feel more active
const seedMessages: Shout[] = [
  { id: -1, user: "MTGPlayer", text: "Just built my first deck here - love the AI suggestions!", ts: Date.now() - (2 * 24 * 60 * 60 * 1000) },
  { id: -2, user: "DeckBuilder", text: "How do I export my deck to Moxfield?", ts: Date.now() - (1.5 * 24 * 60 * 60 * 1000) },
  { id: -3, user: "CommanderFan", text: "The cost-to-finish feature saved me so much money!", ts: Date.now() - (1 * 24 * 60 * 60 * 1000) },
  { id: -4, user: "BudgetBuilder", text: "Anyone have tips for building a budget commander deck?", ts: Date.now() - (12 * 60 * 60 * 1000) },
  { id: -5, user: "NewUser", text: "This site is amazing for deck building!", ts: Date.now() - (6 * 60 * 60 * 1000) },
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
