import { randomUUID } from "expo-crypto";
import { supabase } from "../supabase";
import type { VoiceApi, VoiceSessionCredential } from "./types";

async function errorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context?.status === 401)
    return "Your sign-in has expired. Please sign in again before starting voice.";
  if (context?.status === 404)
    return "Voice is still being connected. Please try again shortly, or send a message instead.";
  if (context?.status === 429)
    return "You’ve had a few conversations close together. Take a short pause and try again.";
  if (context?.status === 503)
    return "Voice is temporarily unavailable. Please try again shortly.";
  return "We couldn’t connect to Kindred’s voice service. Check your connection and try again.";
}
export function createVoiceApi(accountId: () => string | null): VoiceApi {
  // Tokens are bound to the account that allocated the session. A later sign-in
  // must never send a different account's token with an earlier conversation.
  const owners = new Map<string, { userId: string; token: string }>();
  return {
    discard: (sessionId) => {
      owners.delete(sessionId);
    },
    start: async (signal) => {
      if (!supabase)
        throw new Error("Please connect Kindred and sign in to use voice.");
      const owner = accountId();
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (
        signal.aborted ||
        !owner ||
        authError ||
        auth.session?.user.id !== owner
      )
        throw new Error(
          "Your sign-in changed. Please start a new conversation.",
        );
      const token = auth.session.access_token;
      const { data, error } = await supabase.functions.invoke("voice-session", {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: "start", request_id: randomUUID() },
        signal,
        timeout: 25000,
      });
      if (error) throw new Error(await errorMessage(error));
      if (
        !data ||
        typeof data.client_secret !== "string" ||
        !data.client_secret ||
        typeof data.session_id !== "string" ||
        typeof data.expires_at !== "number"
      ) {
        throw new Error("Voice isn’t ready yet. Please try again in a moment.");
      }
      if (signal.aborted) throw new Error("The conversation was cancelled.");
      owners.set(data.session_id, { userId: owner, token });
      return data as VoiceSessionCredential;
    },
    finish: async (sessionId, transcript) => {
      const owner = owners.get(sessionId);
      if (!supabase || !owner) throw new Error("No signed-in session.");
      try {
        const { data: auth } = await supabase.auth.getSession();
        const token =
          auth.session?.user.id === owner.userId
            ? auth.session.access_token
            : owner.token;
        const { error } = await supabase.functions.invoke("voice-session", {
          headers: { Authorization: `Bearer ${token}` },
          body: { action: "finish", session_id: sessionId, transcript },
          timeout: 15000,
        });
        if (error) throw new Error("Could not save conversation history.");
      } finally {
        owners.delete(sessionId);
      }
    },
    exchangeSdp: async (sdp, clientSecret, signal) => {
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: sdp,
        signal,
      });
      if (!response.ok) {
        if (response.status === 401)
          throw new Error(
            "The voice connection expired before it started. Please try again.",
          );
        if (response.status === 429)
          throw new Error(
            "The voice service is busy. Take a short pause and try again.",
          );
        throw new Error(
          "The voice service couldn’t connect. Please try again.",
        );
      }
      const answer = await response.text();
      if (!answer.trim().startsWith("v=0"))
        throw new Error(
          "The voice service returned an invalid connection. Please try again.",
        );
      return answer;
    },
  };
}
