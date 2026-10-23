import { wallTime } from "./dates";

/** A small plan a person can describe in one sentence. Weekdays use Sunday = 0. */
export type Plan = {
  goals: string[];
  checkin_time: string;
  checkin_days: number[];
  timezone: string;
};

export const CHECKIN_PRESETS = [
  { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Three times a week", days: [1, 3, 5] },
  { label: "Once a week", days: [1] },
] as const;

/** Validate user/AI input before showing or saving a plan. Never silently invent fields. */
export function normalizePlan(value: unknown): Plan {
  if (!value || typeof value !== "object")
    throw new Error("Tell me your goals and a time that works for you.");
  const raw = value as Record<string, unknown>;
  if (
    !Array.isArray(raw.goals) ||
    raw.goals.length < 1 ||
    raw.goals.length > 5
  ) {
    throw new Error("Choose between one and five goals.");
  }
  const goals = raw.goals.map((goal) => {
    if (typeof goal !== "string" || !goal.trim() || goal.trim().length > 160) {
      throw new Error("Give each goal a short name, up to 160 characters.");
    }
    return goal.trim();
  });
  if (new Set(goals.map((goal) => goal.toLowerCase())).size !== goals.length) {
    throw new Error("Give each goal a different name.");
  }
  if (
    typeof raw.checkin_time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(raw.checkin_time)
  ) {
    throw new Error("Choose a check-in time in HH:MM format.");
  }
  if (
    !Array.isArray(raw.checkin_days) ||
    raw.checkin_days.length < 1 ||
    raw.checkin_days.length > 7 ||
    raw.checkin_days.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(raw.checkin_days).size !== raw.checkin_days.length
  ) {
    throw new Error("Choose one or more different days of the week.");
  }
  if (typeof raw.timezone !== "string" || !raw.timezone)
    throw new Error("Choose a valid timezone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw.timezone }).format(
      new Date(),
    );
  } catch {
    throw new Error("Choose a valid timezone.");
  }
  return {
    goals,
    checkin_time: raw.checkin_time.slice(0, 5),
    checkin_days: [...raw.checkin_days].sort((a, b) => a - b),
    timezone: raw.timezone,
  };
}

export function formatCheckinTime(time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time)) return "Choose a time";
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours! % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours! < 12 ? "AM" : "PM"}`;
}

export function describeCheckinDays(days: readonly number[]): string {
  const selected = [...new Set(days)].sort((a, b) => a - b);
  if (selected.length === 7 && selected.every((d, i) => d === i))
    return "Every day";
  if (selected.join(",") === "1,2,3,4,5") return "Weekdays";
  if (selected.join(",") === "1,3,5") return "Monday, Wednesday & Friday";
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  if (selected.length === 1) return `Every ${names[selected[0]!] ?? "week"}`;
  return selected
    .map((day) => names[day]?.slice(0, 3))
    .filter(Boolean)
    .join(", ");
}

/** Match PostgreSQL's recurring-wall-time DST policy: later fold; shift a gap forward. */
function scheduledInstant(date: string, time: string, timezone: string): Date {
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = nominal + hours * 3_600_000;
    const wall = wallTime(new Date(probe).toISOString(), timezone);
    offsets.add(Date.parse(`${wall.date}T${wall.time}:00Z`) - probe);
  }
  const candidates = [...offsets].map((offset) => {
    const instant = new Date(nominal - offset);
    const wall = wallTime(instant.toISOString(), timezone);
    const difference = Date.parse(`${wall.date}T${wall.time}:00Z`) - nominal;
    return { instant, difference };
  });
  const exact = candidates
    .filter((candidate) => candidate.difference === 0)
    .sort((a, b) => +a.instant - +b.instant);
  if (exact.length) return exact[exact.length - 1]!.instant;
  const afterGap = candidates
    .filter((candidate) => candidate.difference > 0)
    .sort((a, b) => a.difference - b.difference);
  if (afterGap.length) return afterGap[0]!.instant;
  throw new Error("Could not find the next check-in in this timezone.");
}

/** The next manual meeting time, including now if it exactly matches the schedule. */
export function nextCheckin(plan: Plan, now = new Date()): Date {
  const normalized = normalizePlan(plan);
  if (!Number.isFinite(+now)) throw new Error("Choose a valid current time.");
  const currentDate = wallTime(now.toISOString(), normalized.timezone).date;
  const dayZero = Date.parse(`${currentDate}T00:00:00Z`);
  for (let day = 0; day <= 7; day++) {
    const wallDate = new Date(dayZero + day * 86_400_000);
    if (!normalized.checkin_days.includes(wallDate.getUTCDay())) continue;
    const candidate = scheduledInstant(
      wallDate.toISOString().slice(0, 10),
      normalized.checkin_time,
      normalized.timezone,
    );
    if (+candidate >= +now) return candidate;
  }
  throw new Error("Could not find the next scheduled check-in.");
}
