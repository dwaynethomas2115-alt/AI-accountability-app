import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gardenPlants,
  gardenStage,
  gardenToday,
  plantKind,
} from "../src/lib/garden.ts";
import type { Completion, Goal } from "../src/lib/types.ts";

const zone = "America/Whitehorse";
const now = new Date("2026-10-24T02:00:00Z"); // Still Friday, Oct 23 in Whitehorse.
function goal(id: string, patch: Partial<Goal> = {}): Goal {
  return {
    id,
    user_id: "user",
    title: `Goal ${id}`,
    steps: [],
    status: "active",
    schedule: { kind: "daily", days: [] },
    created_at: "2026-09-01T00:00:00Z",
    ...patch,
  };
}
function done(id: string, date: string, suffix = ""): Completion {
  return { id: `${id}-${date}-${suffix}`, goal_id: id, local_date: date };
}

test("a new garden starts at grass and grows only at earned completion milestones", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 6, 7, 13, 14, 90].map(gardenStage),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
  assert.equal(gardenPlants([goal("a")], [], zone, now)[0]!.stage, 0);
});

test("growth deduplicates days, excludes invalid/future records, and remains after a break or pause", () => {
  const completions = [
    done("a", "2026-10-01"),
    done("a", "2026-10-01", "duplicate"),
    done("a", "2026-10-02"),
    done("a", "2026-10-03"),
    done("a", "2026-10-24"),
    done("a", "2026-02-30"),
    done("other", "2026-10-04"),
  ];
  const plant = gardenPlants([goal("a")], completions, zone, now)[0]!;
  assert.equal(plant.completions, 3);
  assert.equal(plant.stage, 2);
  const afterBreak = gardenPlants(
    [goal("a", { status: "paused" })],
    completions.slice(0, 4),
    zone,
    new Date("2027-01-01T00:00:00Z"),
  )[0]!;
  assert.equal(afterBreak.completions, 3);
  assert.equal(afterBreak.stage, 2);
});

test("plant identity and placement survive renaming, reordered goals and unrelated new goals", () => {
  const first = gardenPlants([goal("b"), goal("a")], [], zone, now);
  const updated = gardenPlants(
    [goal("c"), goal("a", { title: "A better goal name" }), goal("b")],
    [],
    zone,
    now,
  );
  assert.equal(
    updated.find((p) => p.goal.id === "a")!.kind,
    first.find((p) => p.goal.id === "a")!.kind,
  );
  assert.deepEqual(
    first.map((p) => p.goal.id),
    ["a", "b"],
  );
  assert.deepEqual(
    updated.map((p) => p.goal.id),
    ["a", "b", "c"],
  );
  assert.equal(plantKind("a"), plantKind("a"));
});

test("daily circle respects local weekdays, paused goals and duplicate completion records", () => {
  const goals = [
    goal("daily"),
    goal("friday", { schedule: { kind: "weekly", days: [5] } }),
    goal("saturday", { schedule: { kind: "custom", days: [6] } }),
    goal("paused", { status: "paused" }),
  ];
  const status = gardenToday(
    goals,
    [
      done("daily", "2026-10-23"),
      done("daily", "2026-10-23", "duplicate"),
      done("friday", "2026-10-24"),
      done("saturday", "2026-10-23"),
      done("paused", "2026-10-23"),
    ],
    zone,
    now,
  );
  assert.equal(status.today, "2026-10-23");
  assert.equal(status.total, 2);
  assert.equal(status.done, 1);
  assert.deepEqual(status.doneGoalIds, ["daily"]);
  assert.deepEqual(gardenToday([], [], zone, now), {
    today: "2026-10-23",
    dueGoals: [],
    doneGoalIds: [],
    done: 0,
    total: 0,
  });
});

test("independent goal growth remains independent beyond one thousand saved completions", () => {
  const history = Array.from({ length: 1100 }, (_, index) => {
    const date = new Date(Date.UTC(2020, 0, 1 + index));
    return done(
      index < 14 ? "older" : "newer",
      date.toISOString().slice(0, 10),
    );
  });
  const plants = gardenPlants(
    [goal("older"), goal("newer")],
    history,
    zone,
    now,
  );
  assert.equal(plants.find((p) => p.goal.id === "older")!.completions, 14);
  assert.equal(plants.find((p) => p.goal.id === "older")!.stage, 4);
  assert.equal(plants.find((p) => p.goal.id === "newer")!.completions, 1086);
});
