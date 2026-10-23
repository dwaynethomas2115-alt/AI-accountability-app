import {
  MAX_VOICE_SECONDS,
  realtimeSessionConfig,
  voiceContext,
  voiceRequestSchema,
  type voiceTranscriptSchema,
} from "./voice.ts";
import type { z } from "zod";

export type SavedVoiceTranscript = z.infer<typeof voiceTranscriptSchema>;
export type VoiceContextInput = Parameters<typeof voiceContext>[0];
export type VoiceStore = {
  authenticate: (token: string) => Promise<string | null>;
  claim: (
    userId: string,
    sessionId: string,
  ) => Promise<"claimed" | "duplicate" | "limited">;
  context: (userId: string) => Promise<VoiceContextInput>;
  finish: (
    userId: string,
    sessionId: string,
    transcript: SavedVoiceTranscript,
    now: Date,
  ) => Promise<"saved" | "already_saved" | "missing" | "expired">;
  failStart: (userId: string, sessionId: string, now: Date) => Promise<void>;
};
export type VoiceDependencies = {
  store: VoiceStore;
  openAIKey: string | undefined;
  model?: string;
  fetch?: typeof fetch;
  now?: () => Date;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
async function boundedJson(req: Request) {
  const max = 70_000;
  if (Number(req.headers.get("content-length") ?? 0) > max)
    throw new Error("Request too large");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("A request body is required");
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

/** Secrets and the Supabase service client are dependency-injected to test authorization without live services. */
export function createVoiceHandler(deps: VoiceDependencies) {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST")
      return respond({ error: "Method not allowed" }, 405);
    const authorization = req.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) return respond({ error: "Authentication required" }, 401);
    let userId: string | null;
    try {
      userId = await deps.store.authenticate(match[1]!);
    } catch {
      return respond(
        { error: "Sign-in could not be checked. Please try again." },
        503,
      );
    }
    if (!userId)
      return respond(
        { error: "Your sign-in has expired. Please sign in again." },
        401,
      );
    let request: z.infer<typeof voiceRequestSchema>;
    try {
      request = voiceRequestSchema.parse(await boundedJson(req));
    } catch {
      return respond(
        { error: "This voice request could not be read. Please try again." },
        400,
      );
    }

    if (request.action === "finish") {
      try {
        const result = await deps.store.finish(
          userId,
          request.session_id,
          request.transcript,
          now(),
        );
        if (result === "missing")
          return respond({ error: "Conversation not found." }, 404);
        if (result === "expired")
          return respond(
            { error: "This conversation can no longer be saved." },
            410,
          );
        return respond({ ok: true });
      } catch {
        return respond(
          {
            error:
              "Your conversation ended, but its transcript could not be saved.",
          },
          503,
        );
      }
    }

    if (!deps.openAIKey)
      return respond(
        { error: "Voice is not connected yet. Please try again later." },
        503,
      );
    let claimed = false;
    const sessionId = request.request_id;
    try {
      const result = await deps.store.claim(userId, sessionId);
      if (result === "duplicate")
        return respond(
          {
            error:
              "That voice request was already received. Start a new conversation.",
          },
          409,
        );
      if (result === "limited")
        return respond(
          {
            error:
              "You’ve reached the voice session limit. Please try again later.",
          },
          429,
        );
      claimed = true;
      const context = voiceContext(await deps.store.context(userId));
      const model = deps.model || "gpt-realtime";
      const provider = await fetcher(
        "https://api.openai.com/v1/realtime/client_secrets",
        {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${deps.openAIKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expires_after: { anchor: "created_at", seconds: 60 },
            session: realtimeSessionConfig(context, model, now()),
          }),
        },
      );
      if (!provider.ok) {
        await deps.store.failStart(userId, sessionId, now());
        return respond(
          {
            error:
              provider.status === 429
                ? "The voice service has reached its usage limit. Please try again later."
                : "Kindred’s voice service is temporarily unavailable. Please try again later.",
          },
          provider.status === 429 ? 429 : 503,
        );
      }
      const credential: unknown = await provider.json();
      if (!credential || typeof credential !== "object")
        throw new Error("Invalid provider response");
      const value = (credential as Record<string, unknown>).value;
      const expiresAt = (credential as Record<string, unknown>).expires_at;
      if (
        typeof value !== "string" ||
        !value.startsWith("ek_") ||
        typeof expiresAt !== "number" ||
        !Number.isSafeInteger(expiresAt) ||
        expiresAt * 1000 <= now().getTime()
      )
        throw new Error("Invalid provider credential");
      return respond({
        client_secret: value,
        expires_at: expiresAt,
        session_id: sessionId,
        model,
        max_duration_seconds: MAX_VOICE_SECONDS,
      });
    } catch {
      if (claimed) {
        try {
          await deps.store.failStart(userId, sessionId, now());
        } catch {
          /* Preserve the original failure and rate-limit ledger. */
        }
      }
      return respond(
        { error: "Voice could not start. Please try again in a moment." },
        503,
      );
    }
  };
}
