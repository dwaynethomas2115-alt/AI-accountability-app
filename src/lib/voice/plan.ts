import type { VoicePlan } from "./types";
export function parseVoicePlan(value: unknown): VoicePlan {
  if (!value || typeof value !== "object")
    throw new Error("Please describe your goals and a time to check in.");
  const p = value as Record<string, unknown>;
  if (
    !Array.isArray(p.goals) ||
    p.goals.length < 1 ||
    p.goals.length > 5 ||
    p.goals.some(
      (g) => typeof g !== "string" || !g.trim() || g.trim().length > 160,
    )
  )
    throw new Error("Choose one to five short goals.");
  if (
    typeof p.checkin_time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.checkin_time)
  )
    throw new Error("Choose a valid check-in time.");
  if (
    !Array.isArray(p.checkin_days) ||
    p.checkin_days.length < 1 ||
    p.checkin_days.length > 7 ||
    p.checkin_days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error("Choose valid days for check-ins.");
  return {
    goals: [...new Set((p.goals as string[]).map((g) => g.trim()))],
    checkin_time: p.checkin_time,
    checkin_days: [...new Set(p.checkin_days as number[])].sort(
      (a, b) => a - b,
    ),
  };
}
export function planSummary(plan: VoicePlan) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const frequency =
    plan.checkin_days.length === 7
      ? "every day"
      : !plan.checkin_days.length
        ? "whenever you choose"
        : plan.checkin_days.map((d) => days[d]).join(", ");
  return `${plan.goals.join("; ")}. Check in ${frequency}${plan.checkin_days.length ? ` at ${plan.checkin_time}` : ""}.`;
}
// Deliberately accept only clear, unqualified consent. An inferred "yes" in an
// unrelated or conditional sentence must never let a model change a user's plan.
export function isClearVoiceConfirmation(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(yes|yeah|yep|yes please|yes that's right|yes that is right|yes save it|yes save that|yes save the plan|yes please save it|yes please save that|that's right|that is right|sounds good|that sounds good|save it|save that|save the plan|please save it|please save that|go ahead|yes go ahead|i confirm|i confirm the plan|that works|that works for me|let's do it)$/.test(
    normalized,
  );
}
