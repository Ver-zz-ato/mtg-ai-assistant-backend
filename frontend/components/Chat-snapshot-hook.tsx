/**
 * Chat snapshot rendering hook:
 *
 * Wherever you map assistant messages to JSX, detect the JSON meta block:
 *
 *   import { DeckSnapshotCard } from "@/components/DeckSnapshotCard";
 *   const isSnapshot = /```json[\s\S]*"mtg_snapshot_v":\s*1[\s\S]*```/.test(m.content);
 *   return isSnapshot ? <DeckSnapshotCard content={m.content} /> : <MessageBubble ... />;
 *
 * This requires the analyze endpoint (or chat fallback) to include the JSON
 * code fence as implemented in this patch.
 */
export const CHAT_SNAPSHOT_HOOK_DOCS = true;
