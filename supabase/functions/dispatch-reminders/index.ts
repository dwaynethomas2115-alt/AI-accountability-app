import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { json } from "../_shared/http.ts";
async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const hash = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  return x.every((v, i) => v === y[i]);
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("REMINDER_WORKER_SECRET");
  if (
    !secret ||
    !(await sameSecret(
      req.headers.get("Authorization") ?? "",
      `Bearer ${secret}`,
    ))
  )
    return json({ error: "Unauthorized" }, 401);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: jobs, error } = await db.rpc("claim_notifications", {
    p_limit: 40,
  });
  if (error) return json({ error: "Could not claim reminders" }, 500);
  let sent = 0,
    failed = 0;
  for (const job of jobs ?? []) {
    try {
      const { data: devices, error: deviceError } = await db
        .from("devices")
        .select("token")
        .eq("user_id", job.user_id);
      if (deviceError) throw new Error("Devices unavailable");
      if (!devices?.length) {
        await db
          .from("notification_jobs")
          .update({ status: "skipped", last_error: "No registered device" })
          .eq("id", job.id);
        continue;
      }
      // Recheck existence after claiming: a user can cancel an event while the worker is running.
      const { data: stillActive } = await db
        .from("notification_jobs")
        .select("id")
        .eq("id", job.id)
        .maybeSingle();
      if (!stillActive) continue;
      const body =
        job.kind === "reminder"
          ? "A little time for something you planned. Ready when you are."
          : job.kind === "post_activity"
            ? "How did it feel? Come share a win, or we can adjust the plan together."
            : "A small check-in, if you have a moment. How are things feeling today?";
      const payload = devices.slice(0, 100).map((d) => ({
        to: d.token,
        title: "A moment with Kindred",
        body,
        sound: "default",
        channelId: "gentle-reminders",
        data: { screen: "Chat", job_id: job.id },
      }));
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          ...(Deno.env.get("EXPO_ACCESS_TOKEN")
            ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Push gateway HTTP ${response.status}`);
      const result = await response.json();
      const tickets = result.data;
      if (!Array.isArray(tickets) || tickets.length !== payload.length)
        throw new Error("Invalid push gateway response");
      for (let i = 0; i < tickets.length; i++)
        if (tickets[i].details?.error === "DeviceNotRegistered")
          await db
            .from("devices")
            .delete()
            .eq("token", payload[i]!.to)
            .eq("user_id", job.user_id);
      const accepted = tickets.some((t) => t.status === "ok");
      const { error: updateError } = await db
        .from("notification_jobs")
        .update({
          status: accepted ? "sent" : "failed",
          sent_at: accepted ? new Date().toISOString() : null,
          tickets,
          last_error: accepted ? null : "Push gateway rejected delivery",
        })
        .eq("id", job.id);
      if (updateError) throw new Error("Could not record push outcome");
      if (accepted) sent++;
      else failed++;
    } catch (e) {
      failed++;
      await db
        .from("notification_jobs")
        .update({
          status: "failed",
          last_error: e instanceof Error ? e.message : "Delivery failed",
        })
        .eq("id", job.id);
    }
  }
  return json({
    claimed: jobs?.length ?? 0,
    accepted_by_gateway: sent,
    failed,
  });
});
