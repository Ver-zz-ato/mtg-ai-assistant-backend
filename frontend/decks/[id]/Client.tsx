// Minimal shim to satisfy `import Client from "./Client"` without changing your pages.
// Safe: does not alter data, only renders a read-only placeholder if used.
"use client";
type Props = { deckId?: string } & Record<string, any>;
export default function Client(_props: Props) {
  return null; // no UI; keeps current server-rendered content intact
}
