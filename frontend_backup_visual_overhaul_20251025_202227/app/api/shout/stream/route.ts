import { addClient, removeClient } from "../hub";

export async function GET(req: Request) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  addClient(writer);

  const enc = new TextEncoder();
  const write = (s: string) => writer.write(enc.encode(s));

  // keep connection alive
  const ping = setInterval(() => {
    write(`: ping\n\n`).catch(() => {});
  }, 30000);

  req.signal.addEventListener("abort", () => {
    clearInterval(ping);
    removeClient(writer);
    writer.close().catch(() => {});
  });

  // greet
  write(`event: hello\ndata: "ok"\n\n`);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
