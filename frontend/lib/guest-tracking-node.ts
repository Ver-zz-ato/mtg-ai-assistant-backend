/**
 * Node-only helpers for guest/session hashing.
 *
 * Kept separate from `lib/guest-tracking.ts` because that module is imported by
 * `middleware.ts` (Edge runtime), and any Node-only imports (crypto/process) will
 * break Edge bundling in dev.
 */

import { createHash } from "node:crypto";

export function hashStringSync(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

