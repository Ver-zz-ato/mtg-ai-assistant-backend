/**
 * POST /api/chat/voice — Mobile voice assistant.
 *
 * STRICT CONTRACT:
 * - Auth: Cookie OR Bearer (same as other authenticated routes)
 * - Request: multipart/form-data with file (or audio), optional mimeType, optional context
 * - Response: { transcript, assistant_text, audio_url, duration_ms, model_used, mode?, actions?, clarification?, spoken_confirmation? }
 * - Max file: 25MB. Reject empty, unsupported formats.
 * - Context: { deckId?, screen?, players?: {id,name,aliases?}[], selfPlayerId?, voiceMode? }
 */

import { NextRequest } from "next/server";
import { VOICE_CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts/voice-chat";
import { DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { buildRateLimitIdentity, enforceDailyDurableRateLimit } from "@/lib/api/route-guard";
import { VOICE_ASSISTANT_FREE, VOICE_ASSISTANT_GUEST, VOICE_ASSISTANT_PRO } from "@/lib/feature-limits";
import { extractIP } from "@/lib/guest-tracking";
import { serverAnalyticsEnabled, captureServer } from "@/lib/server/analytics";
import { checkProStatus } from "@/lib/server-pro-check";
import { VOICE_COMMAND_PARSER_PROMPT } from "@/lib/ai/prompts/voice-commands";
import { put as putAudio } from "@/lib/voice-audio-store";
import { generateClarification } from "@/lib/voice/clarifier";
import { parseCommands } from "@/lib/voice/command-parser";
import { resolveFollowUpCommand, resolvePendingClarification, summarizeMatchQuality } from "@/lib/voice/follow-up";
import { classifyIntent } from "@/lib/voice/intent-classifier";
import { parseLocalGameCommand } from "@/lib/voice/local-command-parser";
import { actionType, assessConfirmationNeed, shouldSkipTtsForResponse } from "@/lib/voice/response-policy";
import { insertVoiceInteraction } from "@/lib/voice/telemetry";
import type { GameAction, VoiceContext, VoiceTargetMatchQuality } from "@/lib/voice/types";

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
const COMMAND_TRANSCRIPTION_PROMPT =
  "This is a Magic: The Gathering table voice command. Expect life totals, poison, energy, commander damage, monarch, initiative, undo, and short replies like yes or no.";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const CHAT_MODEL = DEFAULT_FALLBACK_MODEL;
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

function isShortFollowUpIntent(transcript: string): boolean {
  return /^(yes|yeah|yep|no|nope|undo|undo that|revert that|take that back)$/i.test(transcript.trim());
}

function isLikelyUnclearGameTranscript(transcript: string): boolean {
  const normalized = transcript.trim();
  if (!normalized) return true;
  if (normalized.length < 3) return true;
  if (normalized.length < 6 && !isShortFollowUpIntent(normalized)) return true;
  return false;
}

async function maybeCaptureServerVoiceEvent(args: {
  req: NextRequest;
  userId: string | null;
  mode: string;
  localParserHit: boolean;
  actions: GameAction[] | null;
  pendingActions: GameAction[] | null;
  clarifyReason: string | null;
  confirmationRequired: boolean;
  confirmationReason: string | null;
  confirmationResolution: string | null;
  context: VoiceContext | null;
  skipTts: boolean;
  ttsGenerated: boolean;
  matchQuality: VoiceTargetMatchQuality;
  followUpUsed: boolean;
  durationMs: number;
  finalOutcome: string | null;
}) {
  if (!serverAnalyticsEnabled()) return;
  try {
    const visitorId = args.req.cookies.get("visitor_id")?.value ?? null;
    const distinctId = args.userId ?? visitorId ?? null;
    const clientIp = extractIP(args.req);
    await captureServer(
      "voice.interaction",
      {
        user_id: args.userId,
        visitor_id: visitorId,
        "voice.mode": args.mode,
        "voice.local_parser_hit": args.localParserHit,
        "voice.action_type": actionType(args.actions ?? args.pendingActions),
        "voice.clarify_reason": args.clarifyReason,
        "voice.confirmation_required": args.confirmationRequired,
        "voice.confirmation_reason": args.confirmationReason,
        "voice.confirmation_resolution": args.confirmationResolution,
        "voice.screen": args.context?.screen ?? null,
        "voice.voice_mode": args.context?.voiceMode ?? null,
        "voice.actions_count": args.actions?.length ?? 0,
        "voice.pending_actions_count": args.pendingActions?.length ?? 0,
        "voice.tts_requested": !args.skipTts,
        "voice.tts_generated": args.ttsGenerated,
        "voice.match_quality": args.matchQuality,
        "voice.follow_up_used": args.followUpUsed,
        duration_ms_pre_tts: args.durationMs,
        final_outcome: args.finalOutcome,
      },
      distinctId,
      clientIp && clientIp !== "unknown" ? { ip: clientIp } : undefined,
    );
  } catch {}
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let transcript = "";
  let assistant_text = "";
  let audio_url: string | null = null;
  const model_used = `${TRANSCRIPTION_MODEL}+${CHAT_MODEL}+${TTS_MODEL}`;

  let mode: "game_action" | "chat" | "clarify" = "chat";
  let actions: GameAction[] | null = null;
  let pending_actions: GameAction[] | null = null;
  let clarification: string | null = null;
  let spoken_confirmation: string | null = null;
  let confirmation_required = false;
  let confirmation_reason: string | null = null;
  let local_parser_hit = false;
  let clarify_reason: string | null = null;
  let follow_up_used = false;
  let confirmation_resolution: string | null = null;
  let match_quality: VoiceTargetMatchQuality = "unresolved";
  let final_outcome: string | null = null;
  let context: VoiceContext | null = null;
  let rateIdentity: Awaited<ReturnType<typeof buildRateLimitIdentity>> | null = null;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: 0, model_used: "none", error: "Voice service unavailable" },
        503,
      );
    }

    const { supabase, user } = await getUserAndSupabase(req);
    if (!user) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "Not signed in" },
        401,
      );
    }

    const isPro = await checkProStatus(user.id);
    rateIdentity = await buildRateLimitIdentity(req, user, isPro);
    const rateLimit = isPro
      ? { allowed: true as const, tier: "pro" as const, limit: VOICE_ASSISTANT_PRO, remaining: VOICE_ASSISTANT_PRO, resetAt: null }
      : await enforceDailyDurableRateLimit({
          req,
          supabase,
          routePath: "/api/chat/voice",
          user,
          isPro,
          limits: {
            guest: VOICE_ASSISTANT_GUEST,
            free: VOICE_ASSISTANT_FREE,
            pro: VOICE_ASSISTANT_PRO,
          },
          error: "Daily voice assistant limit reached. Try again tomorrow.",
        });
    if (!rateLimit.allowed) return rateLimit.response;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "Invalid request body" },
        400,
      );
    }

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
        400,
      );
    }
    if (audioBlob.size > MAX_FILE_BYTES) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "File too large (max 25MB)" },
        400,
      );
    }

    const mimeType = (formData.get("mimeType") as string)?.trim() || audioBlob.type || "audio/m4a";
    if (!SUPPORTED_FORMATS.includes(mimeType) && !mimeType.startsWith("audio/")) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: "none", error: "Unsupported audio format" },
        400,
      );
    }

    const contextRaw = (formData.get("context") as string)?.trim();
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw) as VoiceContext;
      } catch {
        context = null;
      }
    }

    const ext = mimeType.includes("m4a") || mimeType.includes("mp4") ? "m4a" : "webm";
    const filename = `audio.${ext}`;

    const whisperForm = new FormData();
    whisperForm.append("file", audioBlob, filename);
    whisperForm.append("model", TRANSCRIPTION_MODEL);
    whisperForm.append("response_format", "json");
    whisperForm.append("prompt", context?.screen === "game" ? COMMAND_TRANSCRIPTION_PROMPT : TRANSCRIPTION_PROMPT);

    const whisperRes = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });
    if (!whisperRes.ok) {
      return jsonResponse(
        { transcript: "", assistant_text: "", audio_url: null, duration_ms: Date.now() - t0, model_used: TRANSCRIPTION_MODEL, error: "Transcription failed" },
        400,
      );
    }

    const whisperJson = (await whisperRes.json()) as { text?: string };
    transcript = (whisperJson?.text ?? "").trim();
    if (!transcript) {
      return jsonResponse(
        { transcript: "", assistant_text: "I didn't catch that. Could you try again?", audio_url: null, duration_ms: Date.now() - t0, model_used: TRANSCRIPTION_MODEL },
        200,
      );
    }

    const isGameScreen = context?.screen === "game";
    if (isGameScreen) {
      const commandContext = {
        players: context?.players,
        selfPlayerId: context?.selfPlayerId,
      };

      if (isLikelyUnclearGameTranscript(transcript) && !context?.pendingClarification?.actions?.length) {
        mode = "clarify";
        clarify_reason = "unclear_audio";
        clarification = "I heard that unclearly. Could you repeat the command?";
        assistant_text = clarification;
        final_outcome = "clarify";
      } else {
        const pendingResolution = resolvePendingClarification(transcript, context);
        if (pendingResolution) {
          confirmation_resolution = pendingResolution.resolution ?? null;
          match_quality = pendingResolution.matchQuality ?? "unresolved";
          if (pendingResolution.outcome === "apply" && pendingResolution.actions?.length) {
            mode = "game_action";
            actions = pendingResolution.actions;
            spoken_confirmation = "Done.";
            assistant_text = spoken_confirmation;
            final_outcome = "applied";
          } else {
            mode = "clarify";
            clarification = pendingResolution.clarification ?? "Please confirm that.";
            assistant_text = clarification;
            final_outcome = pendingResolution.outcome === "cancel" ? "cancelled" : "clarify";
          }
        }
      }

      if (mode === "chat") {
        const followUp = resolveFollowUpCommand(transcript, context);
        if (followUp?.actions.length) {
          follow_up_used = true;
          mode = "game_action";
          actions = followUp.actions;
          spoken_confirmation = followUp.spokenConfirmation ?? "Done.";
          assistant_text = spoken_confirmation;
          match_quality = followUp.matchQuality;
          final_outcome = "applied";
        }
      }

      if (mode === "chat") {
        const localCommand = parseLocalGameCommand(transcript, commandContext);
        if (localCommand?.actions.length) {
          local_parser_hit = true;
          match_quality = summarizeMatchQuality(transcript, localCommand.actions, context?.players);
          const confirmation = assessConfirmationNeed(localCommand.actions, {
            ambiguousTarget: localCommand.ambiguous_target,
          });
          if (confirmation.required) {
            mode = "clarify";
            confirmation_required = true;
            confirmation_reason = confirmation.reason;
            clarify_reason = confirmation.reason;
            pending_actions = localCommand.actions;
            clarification = confirmation.prompt ?? "Please confirm that.";
            assistant_text = clarification;
            final_outcome = "clarify";
          } else {
            mode = "game_action";
            actions = localCommand.actions;
            spoken_confirmation = localCommand.spoken_confirmation || null;
            assistant_text = localCommand.spoken_confirmation || "Done.";
            final_outcome = "applied";
          }
        } else {
          const intent = await classifyIntent(transcript, apiKey);
          const confidence = intent.confidence ?? 0;

          if (intent.mode === "game_action" && confidence >= 0.7) {
            const parsed = await parseCommands(transcript, apiKey, commandContext);
            if (parsed.actions.length > 0) {
              mode = "game_action";
              actions = parsed.actions;
              spoken_confirmation = parsed.spoken_confirmation || null;
              assistant_text = parsed.spoken_confirmation || "Done.";
              local_parser_hit = parsed.local_parser_hit === true;
              follow_up_used = parsed.followup_used === true;
              match_quality = parsed.match_quality ?? summarizeMatchQuality(transcript, parsed.actions, context?.players);
              final_outcome = "applied";
            } else if (parsed.confirmation_required && parsed.pending_actions?.length) {
              mode = "clarify";
              confirmation_required = true;
              confirmation_reason = parsed.confirmation_reason ?? "ambiguous_target";
              clarify_reason = confirmation_reason;
              pending_actions = parsed.pending_actions;
              clarification = parsed.spoken_confirmation || "Please confirm that.";
              assistant_text = clarification;
              match_quality = parsed.match_quality ?? "unresolved";
              final_outcome = "clarify";
            } else {
              const clar = await generateClarification(transcript, apiKey);
              mode = "clarify";
              clarification = clar.clarification;
              assistant_text = clar.clarification;
              clarify_reason = "parser_empty";
              final_outcome = "clarify";
            }
          } else if (intent.mode === "clarify" || confidence < 0.7) {
            const clar = await generateClarification(transcript, apiKey);
            mode = "clarify";
            clarification = clar.clarification;
            assistant_text = clar.clarification;
            clarify_reason = confidence < 0.7 ? "low_confidence" : "intent_clarify";
            final_outcome = "clarify";
          } else if (context?.voiceMode === "commands_only") {
            assistant_text = "That sounds like a question, not a game action.";
            mode = "chat";
            final_outcome = "commands_only_rejected";
          }
        }
      }
    }

    if (mode === "chat" && (context?.voiceMode !== "commands_only" || context?.screen !== "game")) {
      let systemPrompt = VOICE_CHAT_SYSTEM_PROMPT;
      if (context?.deckId) {
        systemPrompt += `\n\nThe user may be asking about deck ${context.deckId}. If relevant, tailor your answer accordingly.`;
      }
      if (context?.screen === "game") {
        systemPrompt += `\n\nIf the user asks about table commands, respond briefly and prefer clarifying over guessing. Supported command grammar:\n${VOICE_COMMAND_PARSER_PROMPT}`;
      }

      const chatBody = prepareOpenAIBody({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript },
        ],
        max_completion_tokens: 500,
      });

      const chatRes = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(chatBody),
      });
      if (!chatRes.ok) {
        assistant_text = "I had trouble processing that. Please try again.";
      } else {
        const chatJson = (await chatRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
        assistant_text = chatJson.choices?.[0]?.message?.content?.trim() ?? "I didn't catch that. Could you repeat?";
      }
      final_outcome = final_outcome ?? "chat";
    }

    const skipTts = shouldSkipTtsForResponse(context, mode);
    let ttsGenerated = false;
    try {
      const ttsRes = skipTts
        ? null
        : await fetch(TTS_URL, {
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
      if (ttsRes?.ok) {
        const buffer = Buffer.from(await ttsRes.arrayBuffer());
        const id = putAudio(buffer);
        const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl?.origin || "";
        audio_url = base ? `${base.replace(/\/$/, "")}/api/chat/voice/audio/${id}` : `/api/chat/voice/audio/${id}`;
        ttsGenerated = true;
      }
    } catch (error) {
      console.error("[voice] TTS error:", error);
    }

    const duration_ms = Date.now() - t0;
    await maybeCaptureServerVoiceEvent({
      req,
      userId: rateIdentity?.userId ?? user.id ?? null,
      mode,
      localParserHit: local_parser_hit,
      actions,
      pendingActions: pending_actions,
      clarifyReason: clarify_reason,
      confirmationRequired: confirmation_required,
      confirmationReason: confirmation_reason,
      confirmationResolution: confirmation_resolution,
      context,
      skipTts,
      ttsGenerated,
      matchQuality: match_quality,
      followUpUsed: follow_up_used,
      durationMs: duration_ms,
      finalOutcome: final_outcome,
    });

    await insertVoiceInteraction({
      user_id: rateIdentity?.userId ?? user.id ?? null,
      anon_id: rateIdentity?.userId ? null : rateIdentity?.keyHash ?? null,
      user_tier: rateIdentity?.tier ?? (isPro ? "pro" : "free"),
      screen: context?.screen ?? null,
      voice_mode: context?.voiceMode ?? null,
      transcript,
      detected_mode: mode,
      local_parser_hit,
      action_count: actions?.length ?? 0,
      pending_action_count: pending_actions?.length ?? 0,
      actions_json: actions,
      pending_actions_json: pending_actions,
      players_snapshot_json: context?.players ?? null,
      players_count: context?.players?.length ?? 0,
      match_quality,
      clarify_reason,
      confirmation_required,
      confirmation_reason,
      confirmation_resolution,
      assistant_text,
      spoken_confirmation,
      tts_requested: !skipTts,
      tts_generated: ttsGenerated,
      follow_up_used,
      final_outcome: final_outcome ?? (mode === "game_action" ? "applied" : mode),
      latency_ms: duration_ms,
      error_code: null,
    });

    const body: Record<string, unknown> = {
      transcript,
      assistant_text,
      audio_url,
      duration_ms,
      model_used,
      mode,
      local_parser_hit,
      tts_skipped: skipTts,
      match_quality,
      follow_up_used,
      confirmation_resolution,
    };
    if (actions !== null) body.actions = actions;
    if (pending_actions !== null) body.pending_actions = pending_actions;
    if (clarification !== null) body.clarification = clarification;
    if (spoken_confirmation !== null) body.spoken_confirmation = spoken_confirmation;
    if (confirmation_required) {
      body.confirmation_required = true;
      body.confirmation_reason = confirmation_reason;
    }
    return jsonResponse(body, 200);
  } catch (error) {
    console.error("[voice] Handler error:", error);
    const duration_ms = Date.now() - t0;
    if (rateIdentity) {
      await insertVoiceInteraction({
        user_id: rateIdentity.userId,
        anon_id: rateIdentity.userId ? null : rateIdentity.keyHash,
        user_tier: rateIdentity.tier,
        screen: context?.screen ?? null,
        voice_mode: context?.voiceMode ?? null,
        transcript,
        detected_mode: mode,
        local_parser_hit,
        action_count: actions?.length ?? 0,
        pending_action_count: pending_actions?.length ?? 0,
        actions_json: actions,
        pending_actions_json: pending_actions,
        players_snapshot_json: context?.players ?? null,
        players_count: context?.players?.length ?? 0,
        match_quality,
        clarify_reason,
        confirmation_required,
        confirmation_reason,
        confirmation_resolution,
        assistant_text,
        spoken_confirmation,
        tts_requested: false,
        tts_generated: false,
        follow_up_used,
        final_outcome: "error",
        latency_ms: duration_ms,
        error_code: error instanceof Error ? error.message.slice(0, 120) : "request_failed",
      });
    }
    return jsonResponse(
      {
        transcript: transcript || "",
        assistant_text: assistant_text || "Something went wrong. Please try again.",
        audio_url,
        duration_ms,
        model_used,
        error: error instanceof Error ? error.message : "Request failed",
      },
      500,
    );
  }
}
