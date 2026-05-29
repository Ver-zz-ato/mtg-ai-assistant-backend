import assert from "node:assert/strict";
import { consumeChatStreamProtocolBuffer, postMessageStream } from "../../lib/threads";

function installBrowserTimingPolyfills() {
  const g = globalThis as typeof globalThis & {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  if (!g.requestAnimationFrame) {
    g.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number;
  }
  if (!g.cancelAnimationFrame) {
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function main() {
  installBrowserTimingPolyfills();

  const splitMetadataA = consumeChatStreamProtocolBuffer("Hello __MANATAP_CHAT_META", false);
  assert.equal(splitMetadataA.text, "Hello ");
  assert.equal(splitMetadataA.buffer, "__MANATAP_CHAT_META");

  const splitMetadataB = consumeChatStreamProtocolBuffer(
    `${splitMetadataA.buffer}DATA__\n{"threadId":"x"}\n__MANATAP_CHAT_METADATA_END__world`,
    true,
  );
  assert.equal(splitMetadataB.text, "world");
  assert.equal(splitMetadataB.buffer, "");

  const chunks = [
    "Hello ",
    "__MANATAP_CHAT_META",
    'DATA__\n{"threadId":"thread-1"}\n__MANATAP_CHAT_METADATA_END__',
    "world",
    "\n[DO",
    "NE]",
  ];

  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async () =>
    new Response(streamFromChunks(chunks), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });

  let text = "";
  let done = false;
  try {
    await postMessageStream(
      { text: "test split markers", threadId: null },
      (token) => {
        text += token;
      },
      () => {
        done = true;
      },
      (error) => {
        throw error;
      },
    );
  } finally {
    (globalThis as any).fetch = originalFetch;
  }

  assert.equal(done, true);
  assert.equal(text, "Hello world");
  assert.equal(text.includes("__MANATAP_CHAT_METADATA__"), false);
  assert.equal(text.includes("[DONE]"), false);

  console.log("stream-client.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
