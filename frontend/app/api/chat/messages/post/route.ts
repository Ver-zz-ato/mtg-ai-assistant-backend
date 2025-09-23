import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";

  const res = await fetch(new URL("/api/chat", req.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: await req.text(),
    cache: "no-store",
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
