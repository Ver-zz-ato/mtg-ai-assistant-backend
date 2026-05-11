import assert from "node:assert";
import { getIndexNowKey, getIndexNowKeyLocation, normalizeIndexNowUrls, submitToIndexNow } from "@/lib/seo/indexnow";

const oldEnv = { ...process.env };

async function main() {
  try {
    process.env.INDEXNOW_KEY = "dedc0b967a2b4916baed8a40404ce092";
    process.env.INDEXNOW_ENABLED = "false";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.manatap.ai";

    assert.strictEqual(getIndexNowKey(), "dedc0b967a2b4916baed8a40404ce092");
    assert.strictEqual(
      getIndexNowKeyLocation(),
      "https://www.manatap.ai/dedc0b967a2b4916baed8a40404ce092.txt"
    );

    const normalized = normalizeIndexNowUrls([
      "/blog/how-manatap-ai-works?utm_source=test#top",
      "https://manatap.ai/blog/how-manatap-ai-works",
      "https://www.manatap.ai/decks/abc",
      "http://localhost:3000/decks/abc",
      "https://preview.vercel.app/decks/abc",
      "https://www.manatap.ai/api/admin/indexnow/submit",
      "https://www.manatap.ai/profile",
      "",
    ]);

    assert.deepStrictEqual(normalized.urls, [
      "https://www.manatap.ai/blog/how-manatap-ai-works",
      "https://www.manatap.ai/decks/abc",
    ]);
    assert.strictEqual(normalized.skippedCount, 6);

    const disabled = await submitToIndexNow(["/blog/how-manatap-ai-works"]);
    assert.deepStrictEqual(
      {
        ok: disabled.ok,
        submittedCount: disabled.submittedCount,
        skippedCount: disabled.skippedCount,
        status: disabled.status,
      },
      { ok: true, submittedCount: 0, skippedCount: 1, status: null }
    );

    delete process.env.INDEXNOW_ENABLED;
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    const preview = await submitToIndexNow(["/decks/abc"]);
    assert.strictEqual(preview.message, "IndexNow disabled.");
    assert.strictEqual(preview.submittedCount, 0);
  } finally {
    process.env = oldEnv;
  }
}

main()
  .then(() => console.log("indexnow.test.ts: all assertions passed."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
export {};
