/**
 * Short-lived store for TTS audio. In-memory only.
 * Used by POST /api/chat/voice and served by GET /api/chat/voice/audio/[id].
 */

import { randomBytes } from "crypto";

const store = new Map<string, { buffer: Buffer; createdAt: number }>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateId(): string {
  return randomBytes(12).toString("hex");
}

export function put(buffer: Buffer): string {
  const id = generateId();
  store.set(id, { buffer, createdAt: Date.now() });
  return id;
}

export function get(id: string): Buffer | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry.buffer;
}

/** Consume and remove. Returns buffer or null. */
export function consume(id: string): Buffer | null {
  const buf = get(id);
  store.delete(id);
  return buf;
}
