export type Schedule = { kind: "daily" | "weekly" | "custom"; days: number[] };
export type Goal = {
  id: string;
  user_id: string;
  source_message_id?: string | null;
  title: string;
  steps: string[];
  schedule: Schedule;
  status: "active" | "paused";
  created_at: string;
};
export type Completion = { id: string; goal_id: string; local_date: string };
export type EventDraft = {
  title: string;
  starts_at: string;
  timezone: string;
  duration_minutes: number;
  reminder_minutes: number;
  post_checkin: boolean;
};
export type CalendarEvent = EventDraft & {
  id: string;
  created_at: string;
  source_message_id?: string | null;
};
export type Memory = { id: string; content: string; created_at: string };
export type Proposal = {
  goal: { title: string; steps: string[]; schedule: Schedule } | null;
  event: EventDraft | null;
  memory: string | null;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  proposal: Proposal | null;
};
export type Profile = {
  display_name: string;
  timezone: string;
  onboarded: boolean;
  checkins_enabled: boolean;
  checkin_time: string;
  checkin_days: number[];
  quiet_start: string;
  quiet_end: string;
  daily_limit: number;
};
export type VoiceHistory = {
  id: string;
  created_at: string;
  ended_at: string | null;
  transcript: { role: "user" | "assistant"; content: string }[];
};
export type Snapshot = {
  profile: Profile;
  goals: Goal[];
  completions: Completion[];
  events: CalendarEvent[];
  memories: Memory[];
  messages: Message[];
  voiceSessions: VoiceHistory[];
};
export const timezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export const defaultProfile = (): Profile => ({
  display_name: "",
  timezone: timezone(),
  onboarded: false,
  checkins_enabled: false,
  checkin_time: "18:00",
  checkin_days: [0, 1, 2, 3, 4, 5, 6],
  quiet_start: "21:00",
  quiet_end: "08:00",
  daily_limit: 2,
});
export const emptySnapshot = (): Snapshot => ({
  profile: defaultProfile(),
  goals: [],
  completions: [],
  events: [],
  memories: [],
  messages: [],
  voiceSessions: [],
});
export function localDate(date = new Date(), zone = timezone()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function dueOn(goal: Goal, date = new Date(), zone = timezone()) {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
    }).format(date),
  );
  return (
    goal.status === "active" &&
    (goal.schedule.kind === "daily" || goal.schedule.days.includes(day))
  );
}
export function progress(
  goals: Goal[],
  completions: Completion[],
  zone: string,
  now = new Date(),
) {
  const today = localDate(now, zone);
  const due = goals.filter((g) => dueOn(g, now, zone));
  return {
    total: due.length,
    done: due.filter((g) =>
      completions.some((c) => c.goal_id === g.id && c.local_date === today),
    ).length,
  };
}
