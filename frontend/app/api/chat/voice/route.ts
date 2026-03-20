/**
 * POST /api/chat/voice — Mobile voice assistant.
 *
 * STRICT CONTRACT:
 * - Auth: Cookie OR Bearer (same as other authenticated routes)
 * - Request: multipart/form-data with file (or audio), optional mimeType, optional context
 * - Response: { transcript, assistant_text, audio_url, duration_ms, model_used }
 * - Max file: 25MB. Reject empty, unsupported formats.
 */

import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { VOICE_CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts/voice-chat";
import { put as putAudio } from "@/lib/voice-audio-store";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_FORMATS = [
  "audio/flac",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/mpga",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
];
const TRANSCRIPTION_PROMPT =
  "This is a Magic: The Gathering conversation. Expect card names, commander names, deckbuilding terms.";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const CHAT_MODEL = "gpt-4o-mini";
const TTS_MODEL = "gpt-4o-mini-tts";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const TTS_URL = "https://api.openai.com/v1/audio/speech";

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let transcript = "";
  let assistant_text = "";
  let audio_url: string | null = null;
  let model_used = `${TRANSCRIPTION_MODEL}+${CHAT_MODEL}+${TTS_MODEL}`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: 0, model_used: "none", error: "Voice service unavailable" },
        503
      );
    }

    // Auth: Cookie OR Bearer (same precedence as /api/chat/stream)
    let supabase = await getServerSupabase();
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser(bearerToken);
        if (bearerUser) user = bearerUser;
      }
    }
    if (!user) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "Not signed in" },
        401
      );
    }

    // Parse multipart
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "Invalid request body" },
        400
      );
    }

    // Accept "file" or "audio" (mobile sends "audio")
    const audioFile = formData.get("file") ?? formData.get("audio");
    const audioBlob =
      audioFile instanceof Blob
        ? audioFile
        : typeof audioFile === "object" && audioFile !== null && "arrayBuffer" in audioFile
          ? (audioFile as Blob)
          : null;

    if (!audioBlob || audioBlob.size === 0) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "No audio file" },
        400
      );
    }

    if (audioBlob.size > MAX_FILE_BYTES) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "File too large (max 25MB)" },
        400
      );
    }

    const mimeType = (formData.get("mimeType") as string)?.trim() || audioBlob.type || "audio/m4a";
    if (!SUPPORTED_FORMATS.includes(mimeType) && !mimeType.startsWith("audio/")) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "Unsupported audio format" },
        400
      );
    }

    const contextRaw = (formData.get("context") as string)?.trim();
    let context: { deckId?: string; screen?: string } | null = null;
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw) as { deckId?: string; screen?: string };
      } catch {
        // ignore invalid context
      }
    }

    const ext = mimeType.includes("m4a") || mimeType.includes("mp4") ? "m4a" : "webm";
    const filename = `audio.${ext}`;

    // --- STEP 1: Transcription ---
    const whisperForm = new FormData();
    whisperForm.append("file", audioBlob, filename);
    whisperForm.append("model", TRANSCRIPTION_MODEL);
    whisperForm.append("response_format", "json");
    whisperForm.append("prompt", TRANSCRIPTION_PROMPT);

    const whisperRes = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error("[voice] Transcription error:", err);
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: TRANSCRIPTION_MODEL, error: "Transcription failed" },
        400
      );
    }

    const whisperJson = (await whisperRes.json()) as { text?: string };
    transcript = (whisperJson?.text ?? "").trim();

    if (!transcript) {
      return jsonResponse(
        { transcript: "", assistant_text: "I didn't catch that. Could you try again?", audio_url: null, duration_ms: Date.now() - t0, model_used: TRANSCRIPTION_MODEL },
        200
      );
    }

    // --- STEP 2: AI response ---
    let systemPrompt = VOICE_CHAT_SYSTEM_PROMPT;
    if (context?.deckId) {
      systemPrompt += `\n\nThe user may be asking about deck ${context.deckId}. If relevant, tailor your answer accordingly.`;
    }

    const chatRes = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!chatRes.ok) {
      const err = await chatRes.text();
      console.error("[voice] Chat error:", err);
      assistant_text = "I had trouble processing that. Please try again.";
    } else {
      const chatJson = (await chatRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
      assistant_text = chatJson.choices?.[0]?.message?.content?.trim() ?? "I didn't catch that. Could you repeat?";
    }

    // --- STEP 3: TTS ---
    try {
      const ttsRes = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: TTS_MODEL,
          voice: "nova",
          input: assistant_text,
        }),
      });

      if (ttsRes.ok) {
        const buffer = Buffer.from(await ttsRes.arrayBuffer());
        const id = putAudio(buffer);
        const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl?.origin || "";
        audio_url = base ? `${base.replace(/\/$/, "")}/api/chat/voice/audio/${id}` : `/api/chat/voice/audio/${id}`;
      }
    } catch (e) {
      console.error("[voice] TTS error:", e);
    }

    const duration_ms = Date.now() - t0;
    return jsonResponse(
      { transcript, assistant_text, audio_url, duration_ms, model_used },
      200
    );
  } catch (e) {
    console.error("[voice] Handler error:", e);
    const duration_ms = Date.now() - t0;
    return jsonResponse(
      {
        transcript: transcript || "",
        assistant_text: assistant_text || "Something went wrong. Please try again.",
        audio_url,
        duration_ms,
        model_used,
        error: e instanceof Error ? e.message : "Request failed",
      },
      500
    );
  }
}
