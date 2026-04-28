/**
 * Mulligan advice API: optional format enum + default Commander compatibility.
 * Run: tsx tests/unit/mulligan-advice-format.test.ts
 */

import { z } from "zod";
import { MULLIGAN_ADVICE_FORMATS } from "../../lib/mulligan/advice-handler";

const AdviceFormatSchema = z.object({
  format: z.enum(MULLIGAN_ADVICE_FORMATS).optional(),
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("[mulligan-advice-format] schema + defaults");

  assert(MULLIGAN_ADVICE_FORMATS.length === 5, "expected five formats");
  const empty = AdviceFormatSchema.safeParse({});
  assert(empty.success, "empty body should parse");
  assert(empty.data.format === undefined, "format optional");

  const modern = AdviceFormatSchema.safeParse({ format: "modern" });
  assert(modern.success && modern.data.format === "modern", "modern accepted");

  const bad = AdviceFormatSchema.safeParse({ format: "legacy" });
  assert(!bad.success, "unknown format rejected");

  console.log("[mulligan-advice-format] OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
