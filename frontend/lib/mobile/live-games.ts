import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { getServiceRoleClient } from "@/lib/server-supabase";

export const LIVE_GAME_INVITE_TTL_HOURS = 24;
export const LIVE_GAME_STATE_MAX_BYTES = 64 * 1024;

export const liveGameEditModeSchema = z.enum(["host_only", "everyone"]);

export const liveGameStateSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    players: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128).optional(),
            name: z.string().max(80).optional(),
          })
          .passthrough()
      )
      .min(1)
      .max(8)
      .optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (bytes > LIVE_GAME_STATE_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `state must be ${LIVE_GAME_STATE_MAX_BYTES} bytes or less`,
      });
    }
  });

export const createLiveGameBodySchema = z.object({
  state: liveGameStateSchema,
  editMode: liveGameEditModeSchema.default("host_only"),
});

export const joinLiveGameBodySchema = z
  .object({
    token: z.string().min(20).max(256).optional(),
    inviteToken: z.string().min(20).max(256).optional(),
    inviteUrl: z.string().min(1).max(2048).optional(),
  })
  .refine((value) => Boolean(value.token || value.inviteToken || value.inviteUrl), {
    message: "token required",
  });

export const updateLiveGameBodySchema = z.object({
  state: liveGameStateSchema,
});

export const updateLiveGameModeBodySchema = z.object({
  editMode: liveGameEditModeSchema,
});

export const endLiveGameBodySchema = z.object({
  state: liveGameStateSchema.optional(),
});

export type LiveGameEditMode = z.infer<typeof liveGameEditModeSchema>;
export type LiveGameState = z.infer<typeof liveGameStateSchema>;

export type LiveGameSessionRow = {
  id: string;
  host_user_id: string;
  state: LiveGameState;
  version: number;
  edit_mode: LiveGameEditMode;
  status: "active" | "ended" | "revoked";
  invite_revoked_at: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  expires_at: string;
};

type LiveGameParticipantRow = {
  id: string;
  live_game_id: string;
  user_id: string;
  role: "host" | "participant";
  joined_at: string;
};

type AdminClient = SupabaseClient<any, "public", any>;

export function isAnonymousSupabaseUser(user: User): boolean {
  return (user as User & { is_anonymous?: boolean }).is_anonymous === true;
}

export async function requireLiveGameUser(req: NextRequest): Promise<
  | { ok: true; user: User }
  | { ok: false; response: NextResponse }
> {
  const { user } = await getUserAndSupabase(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }),
    };
  }

  return { ok: true, user };
}

export function requireLiveGameAdmin(): AdminClient | NextResponse {
  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }
  return admin;
}

export function makeInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getInviteTokenFromJoinBody(body: z.infer<typeof joinLiveGameBodySchema>): string | null {
  const direct = body.token ?? body.inviteToken;
  if (direct) return direct.trim();

  const inviteUrl = body.inviteUrl?.trim();
  if (!inviteUrl) return null;

  try {
    const parsed = new URL(inviteUrl);
    return parsed.searchParams.get("liveGameToken") ?? parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

export function buildLiveGameInviteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://www.manatap.ai";
  const url = new URL("/app/live-game", base);
  url.searchParams.set("liveGameToken", token);
  return url.toString();
}

export function liveGameExpiresAt(): string {
  return new Date(Date.now() + LIVE_GAME_INVITE_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function serializeLiveGame(session: LiveGameSessionRow, userId: string) {
  const isHost = session.host_user_id === userId;
  return {
    id: session.id,
    state: session.state,
    version: session.version,
    editMode: session.edit_mode,
    status: session.status,
    isHost,
    canEdit: isHost || session.edit_mode === "everyone",
    expiresAt: session.expires_at,
    updatedAt: session.updated_at,
    endedAt: session.ended_at,
  };
}

export function assertUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getLiveGameAccess(admin: AdminClient, liveGameId: string, userId: string): Promise<
  | {
      ok: true;
      session: LiveGameSessionRow;
      participant: LiveGameParticipantRow | null;
      isHost: boolean;
      canEdit: boolean;
    }
  | { ok: false; response: NextResponse }
> {
  if (!assertUuid(liveGameId)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Invalid live game id" }, { status: 400 }) };
  }

  const { data: session, error: sessionError } = await admin
    .from("live_game_sessions")
    .select("*")
    .eq("id", liveGameId)
    .maybeSingle();

  if (sessionError) {
    console.error("[live-games] session lookup failed", sessionError);
    return { ok: false, response: NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }) };
  }
  if (!session) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Live game not found" }, { status: 404 }) };
  }

  const typedSession = session as LiveGameSessionRow;
  const isHost = typedSession.host_user_id === userId;

  const { data: participant, error: participantError } = await admin
    .from("live_game_participants")
    .select("*")
    .eq("live_game_id", liveGameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (participantError) {
    console.error("[live-games] participant lookup failed", participantError);
    return { ok: false, response: NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }) };
  }

  if (!isHost && !participant) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 }) };
  }

  return {
    ok: true,
    session: typedSession,
    participant: participant as LiveGameParticipantRow | null,
    isHost,
    canEdit: isHost || typedSession.edit_mode === "everyone",
  };
}

export function ensureActiveLiveGame(session: LiveGameSessionRow): NextResponse | null {
  if (session.status === "revoked") {
    return NextResponse.json({ ok: false, error: "Live game invite was revoked" }, { status: 410 });
  }
  if (session.status === "ended") {
    return NextResponse.json({ ok: false, error: "Live game has ended" }, { status: 409 });
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "Live game expired" }, { status: 410 });
  }
  return null;
}

export function hasPlayerNameChanges(previousState: LiveGameState, nextState: LiveGameState): boolean {
  const previous = getPlayerNameMap(previousState);
  const next = getPlayerNameMap(nextState);

  for (const [key, previousName] of previous.entries()) {
    if (next.has(key) && next.get(key) !== previousName) return true;
  }

  return false;
}

function getPlayerNameMap(state: LiveGameState): Map<string, string> {
  const map = new Map<string, string>();
  const players = Array.isArray(state.players) ? state.players : [];
  players.forEach((player, index) => {
    if (!player || typeof player !== "object") return;
    const record = player as Record<string, unknown>;
    const key = typeof record.id === "string" && record.id.trim() ? record.id : `index:${index}`;
    const name = typeof record.name === "string" ? record.name : "";
    map.set(key, name);
  });
  return map;
}

export function checkLiveGameBurstLimit(
  req: NextRequest,
  action: "create" | "join" | "update" | "mode" | "revoke" | "end",
  userId: string
): { allowed: true; rateLimit: ReturnType<typeof checkRateLimit> } | { allowed: false; response: NextResponse } {
  const maxRequests = action === "update" ? 240 : action === "join" ? 60 : 30;
  const rateLimit = checkRateLimit(
    req,
    {
      windowMs: 60 * 1000,
      maxRequests,
      keyGenerator: () => `live-game:${action}:${userId}`,
    },
    userId
  );

  if (!rateLimit.allowed) {
    return {
      allowed: false,
      response: addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter }, { status: 429 }),
        rateLimit
      ),
    };
  }

  return { allowed: true, rateLimit };
}

export function withLiveGameRateLimitHeaders(
  response: NextResponse,
  rateLimit: ReturnType<typeof checkRateLimit>
): NextResponse {
  return addRateLimitHeaders(response, rateLimit);
}
