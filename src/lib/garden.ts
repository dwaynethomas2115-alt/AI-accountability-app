import { dueOn, localDate, type Completion, type Goal } from "./types";

export type PlantKind = "tree" | "blossom" | "flower" | "lavender";
export type GardenStage = 0 | 1 | 2 | 3 | 4;
export type GardenPlant = {
  goal: Goal;
  kind: PlantKind;
  completions: number;
  stage: GardenStage;
};
export const GARDEN_THRESHOLDS = [0, 1, 3, 7, 14] as const;
export const GARDEN_STAGE_NAMES = [
  "Fresh grass",
  "First sprout",
  "Taking root",
  "Growing strong",
  "In full bloom",
] as const;

/** Growth is earned by completed days; elapsed time never takes it away. */
export function gardenStage(completions: number): GardenStage {
  const count = Number.isFinite(completions) ? Math.max(0, completions) : 0;
  if (count >= 14) return 4;
  if (count >= 7) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

/** Goal identity, rather than array position or editable title, owns its plant. */
export function plantKind(goalId: string): PlantKind {
  let hash = 2166136261;
  for (let i = 0; i < goalId.length; i++)
    hash = Math.imul(hash ^ goalId.charCodeAt(i), 16777619) >>> 0;
  return (["tree", "blossom", "flower", "lavender"] as const)[hash % 4]!;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function gardenPlants(
  goals: Goal[],
  completions: Completion[],
  zone: string,
  now = new Date(),
): GardenPlant[] {
  const today = localDate(now, zone);
  const daysByGoal = new Map<string, Set<string>>();
  for (const completion of completions) {
    if (!validDate(completion.local_date) || completion.local_date > today)
      continue;
    let days = daysByGoal.get(completion.goal_id);
    if (!days) daysByGoal.set(completion.goal_id, (days = new Set()));
    days.add(completion.local_date);
  }
  // A paused goal keeps its earned growth. Callers can choose whether to display it.
  return [...goals]
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .map((goal) => {
      const count = daysByGoal.get(goal.id)?.size ?? 0;
      return {
        goal,
        kind: plantKind(goal.id),
        completions: count,
        stage: gardenStage(count),
      };
    });
}

export function gardenToday(
  goals: Goal[],
  completions: Completion[],
  zone: string,
  now = new Date(),
) {
  const today = localDate(now, zone);
  const dueGoals = goals.filter((goal) => dueOn(goal, now, zone));
  const completed = new Set(
    completions
      .filter((item) => item.local_date === today)
      .map((item) => item.goal_id),
  );
  const doneGoalIds = dueGoals
    .filter((goal) => completed.has(goal.id))
    .map((goal) => goal.id);
  return {
    today,
    dueGoals,
    doneGoalIds,
    done: doneGoalIds.length,
    total: dueGoals.length,
  };
}
