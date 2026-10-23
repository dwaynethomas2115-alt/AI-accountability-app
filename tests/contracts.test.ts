import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestSchema,
  replySchema,
  eventSchema,
} from "../supabase/functions/_shared/contracts.ts";
import { localDate, dueOn, progress, type Goal } from "../src/lib/types.ts";
test("AI actions reject invalid schedules, unknown fields, and timezone-free dates", () => {
  const base = {
    reply: "We can take this gently.",
    goal: null,
    event: null,
    memory: null,
  };
  assert.ok(replySchema.safeParse(base).success);
  assert.equal(
    replySchema.safeParse({
      ...base,
      goal: {
        title: "Walk",
        steps: [],
        schedule: { kind: "weekly", days: [] },
      },
    }).success,
    false,
  );
  assert.equal(replySchema.safeParse({ ...base, secret: "no" }).success, false);
  assert.equal(
    eventSchema.safeParse({
      title: "Gym",
      starts_at: "2026-10-21T18:00:00",
      timezone: "America/Whitehorse",
      duration_minutes: 60,
      reminder_minutes: 30,
      post_checkin: true,
    }).success,
    false,
  );
  assert.ok(
    eventSchema.safeParse({
      title: "Gym",
      starts_at: "2026-10-21T18:00:00-07:00",
      timezone: "America/Whitehorse",
      duration_minutes: 60,
      reminder_minutes: 30,
      post_checkin: true,
    }).success,
  );
  assert.equal(
    requestSchema.safeParse({ text: " ", request_id: crypto.randomUUID() })
      .success,
    false,
  );
});
test("goal progress respects local date, custom days, and paused goals", () => {
  const now = new Date("2026-10-22T01:00:00Z");
  const zone = "America/Whitehorse";
  assert.equal(localDate(now, zone), "2026-10-21");
  const goal: Goal = {
    id: "one",
    user_id: "u",
    title: "Walk",
    steps: [],
    schedule: { kind: "custom", days: [3] },
    status: "active",
    created_at: now.toISOString(),
  };
  assert.equal(dueOn(goal, now, zone), true);
  assert.equal(dueOn({ ...goal, status: "paused" }, now, zone), false);
  assert.deepEqual(
    progress(
      [goal],
      [{ id: "c", goal_id: "one", local_date: "2026-10-21" }],
      zone,
      now,
    ),
    { done: 1, total: 1 },
  );
  assert.deepEqual(
    progress(
      [goal],
      [{ id: "c", goal_id: "one", local_date: "2026-10-22" }],
      zone,
      now,
    ),
    { done: 0, total: 1 },
  );
});

import { toInstant, wallTime } from "../src/lib/dates.ts";
test("calendar conversion respects timezone and rejects DST gaps and repeated hours", () => {
  assert.equal(
    toInstant("2026-10-21", "18:00", "America/Whitehorse"),
    "2026-10-22T01:00:00.000Z",
  );
  assert.deepEqual(wallTime("2026-10-22T01:00:00.000Z", "America/Whitehorse"), {
    date: "2026-10-21",
    time: "18:00",
  });
  assert.throws(
    () => toInstant("2026-03-08", "02:30", "America/New_York"),
    /does not exist/,
  );
  assert.throws(
    () => toInstant("2026-11-01", "01:30", "America/New_York"),
    /occurs twice/,
  );
  assert.throws(() => toInstant("2026-02-30", "12:00", "UTC"), /valid date/);
});
