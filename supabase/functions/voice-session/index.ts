import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  createVoiceHandler,
  type VoiceStore,
} from "../_shared/voice-service.ts";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// These values are supplied by Supabase to deployed functions. A setup failure
// returns an error rather than falling back to a public client.
if (!url || !serviceKey)
  throw new Error("Supabase function environment is missing");
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store: VoiceStore = {
  async authenticate(token) {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  },
  async claim(userId, sessionId) {
    const { data, error } = await db.rpc("claim_voice_session", {
      p_user: userId,
      p_session: sessionId,
    });
    if (error) {
      if (
        error.code === "P0001" &&
        error.message.includes("Voice session limit reached")
      )
        return "limited";
      throw new Error("Voice session storage unavailable");
    }
    return data === true ? "claimed" : "duplicate";
  },
  async context(userId) {
    const [profile, goals, memories, messages, sessions] = await Promise.all([
      db
        .from("profiles")
        .select("display_name,timezone,checkin_time,checkin_days,onboarded")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("goals")
        .select("title,status")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at")
        .limit(5),
      db
        .from("memories")
        .select("content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("messages")
        .select("role,content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
      db
        .from("voice_sessions")
        .select("transcript")
        .eq("user_id", userId)
        .not("ended_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    for (const result of [profile, goals, memories, messages, sessions])
      if (result.error) throw new Error("Voice context unavailable");
    return {
      profile: profile.data,
      goals: goals.data ?? [],
      memories: memories.data ?? [],
      messages: (messages.data ?? []).reverse(),
      voice_sessions: sessions.data ?? [],
    };
  },
  async finish(userId, sessionId, transcript, now) {
    const { data: session, error } = await db
      .from("voice_sessions")
      .select("id,ended_at,expires_at")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Conversation storage unavailable");
    if (!session) return "missing";
    if (session.ended_at) return "already_saved";
    // A brief grace window allows the final network request after a disconnected call.
    const cutoff = new Date(now.getTime() - 5 * 60_000).toISOString();
    if (Date.parse(session.expires_at) <= Date.parse(cutoff)) return "expired";
    const { data: saved, error: saveError } = await db
      .from("voice_sessions")
      .update({ transcript, ended_at: now.toISOString() })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .gt("expires_at", cutoff)
      .select("id");
    if (saveError) throw new Error("Conversation could not be saved");
    if (saved?.length) return "saved";
    // A concurrent finish is idempotent; a deleted session must never be recreated.
    const { data: remaining, error: remainingError } = await db
      .from("voice_sessions")
      .select("ended_at")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (remainingError) throw new Error("Conversation storage unavailable");
    return remaining?.ended_at ? "already_saved" : "missing";
  },
  async failStart(userId, sessionId, now) {
    const { error } = await db
      .from("voice_sessions")
      .update({ ended_at: now.toISOString() })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("ended_at", null);
    if (error) throw new Error("Could not close failed session");
  },
};

Deno.serve(
  createVoiceHandler({
    store,
    openAIKey: Deno.env.get("OPENAI_API_KEY"),
    model: Deno.env.get("OPENAI_REALTIME_MODEL") || "gpt-realtime",
  }),
);
