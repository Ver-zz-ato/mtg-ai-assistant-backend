declare module "stream-json" {
  import type { Transform } from "node:stream";

  // stream-json's API surface is extensive; we only need a tiny subset for bulk imports.
  export function parser(): Transform;
}

declare module "stream-json/streamers/StreamArray" {
  import type { Transform } from "node:stream";

  export function streamArray(): Transform;
}
