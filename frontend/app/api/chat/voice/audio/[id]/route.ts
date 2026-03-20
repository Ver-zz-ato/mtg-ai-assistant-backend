/**
 * GET /api/chat/voice/audio/[id]
 * Serves short-lived TTS audio. ID is unguessable; no auth required.
 */

import { NextRequest } from "next/server";
import { consume } from "@/lib/voice-audio-store";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id?.trim()) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = consume(id);
  if (!buffer) {
    return new Response("Not found or expired", { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
