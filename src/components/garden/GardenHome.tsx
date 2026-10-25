import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  X,
} from "lucide-react-native";
import { colors, Button } from "../ui";
import { FloatingGarden, PLOTS } from "./FloatingGarden";
import { useCompanion } from "../../state/CompanionProvider";
import {
  gardenPlants,
  gardenStage,
  gardenToday,
  GARDEN_STAGE_NAMES,
  GARDEN_THRESHOLDS,
  type GardenStage,
  type PlantKind,
} from "../../lib/garden";
import { dueOn, type Goal } from "../../lib/types";
const PREVIEWS = [
  "Just grass",
  "First sprouts",
  "Growing",
  "In bloom",
  "Full garden",
];
const KINDS: Record<PlantKind, string> = {
  tree: "Oak tree",
  blossom: "Blossom tree",
  flower: "Peach flowers",
  lavender: "Lavender",
};
const SAMPLES: Goal[] = [
  "Movement",
  "Learning",
  "Rest",
  "Creativity",
  "Connection",
].map((title, i) => ({
  id: `preview-${i}`,
  user_id: "preview",
  title,
  steps: [],
  schedule: { kind: "daily", days: [] },
  status: "active",
  created_at: `2026-01-0${i + 1}T00:00:00Z`,
}));
function ProgressCircle({
  done,
  total,
  preview,
  onPress,
}: {
  done: number;
  total: number;
  preview: boolean;
  onPress: () => void;
}) {
  const circumference = 2 * Math.PI * 34;
  const ratio = total ? Math.min(done / total, 1) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={preview ? "Preview progress" : "Today’s progress"}
      accessibilityHint={
        preview
          ? "Sample progress"
          : `${done} of ${total} goals completed today. Open your goals and record progress.`
      }
      disabled={preview}
      onPress={onPress}
      style={styles.ring}
    >
      <Svg width={84} height={84} viewBox="0 0 84 84" accessible={false}>
        <Circle
          cx={42}
          cy={42}
          r={34}
          stroke="#E3E5D9"
          strokeWidth={7}
          fill="none"
        />
        {ratio > 0 && (
          <Circle
            cx={42}
            cy={42}
            r={34}
            stroke={colors.green}
            strokeWidth={7}
            fill="none"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 42 42)"
          />
        )}
      </Svg>
      <View pointerEvents="none" style={styles.ringText}>
        <Text style={styles.ratio}>
          {done}/{total}
        </Text>
        <Text style={styles.ringLabel}>{preview ? "Preview" : "Today"}</Text>
      </View>
    </Pressable>
  );
}
export function GardenHome({
  children,
  active,
  onPlan,
}: {
  children: React.ReactNode;
  active: boolean;
  onPlan: () => void;
}) {
  const c = useCompanion();
  const [now, setNow] = useState(new Date());
  const [preview, setPreviewStage] = useState<GardenStage | null>(null);
  const [previewDays, setPreviewDays] = useState(0);
  function setPreview(stage: GardenStage | null) {
    setPreviewStage(stage);
    setPreviewDays(stage === null ? 0 : GARDEN_THRESHOLDS[stage]);
  }
  const [details, setDetails] = useState(false);
  const [plotPage, setPlotPage] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setPreview(null);
    setDetails(false);
    setNotice("");
    setPlotPage(0);
  }, [c.session?.user.id, c.demo]);
  useEffect(() => {
    if (active) {
      setPreview(null);
      setDetails(false);
    }
  }, [active]);
  const plants = useMemo(
    () =>
      gardenPlants(
        c.data.goals,
        c.data.completions,
        c.data.profile.timezone,
        now,
      ),
    [c.data.goals, c.data.completions, c.data.profile.timezone, now],
  );
  const today = gardenToday(
    c.data.goals,
    c.data.completions,
    c.data.profile.timezone,
    now,
  );
  const previewing = preview !== null;
  const samplePlants = useMemo(
    () => gardenPlants(SAMPLES, [], c.data.profile.timezone, now),
    [c.data.profile.timezone, now],
  );
  const display = useMemo(
    () =>
      preview !== null
        ? samplePlants.map((p, i) => ({
            ...p,
            kind: (
              ["tree", "blossom", "lavender", "flower", "flower"] as PlantKind[]
            )[i]!,
            stage: preview,
            completions: previewDays,
          }))
        : plants,
    [preview, previewDays, plants, samplePlants],
  );
  const pageCount = Math.max(1, Math.ceil(display.length / 8));
  const page = Math.min(plotPage, pageCount - 1);
  const visible = useMemo(
    () => display.slice(page * 8, page * 8 + 8),
    [display, page],
  );
  const visuals = useMemo(
    () =>
      visible.map((p) => ({
        id: p.goal.id,
        kind: p.kind,
        stage: p.stage,
        completions: p.completions,
        title: p.goal.title,
      })),
    [visible],
  );
  const shownTotal = previewing
    ? Math.min(
        display.filter((p) => p.goal.status === "active").length ||
          display.length,
        5,
      )
    : today.total;
  const shownDone = previewing
    ? Math.round((shownTotal * preview!) / 4)
    : today.done;
  useEffect(() => {
    if (!c.latestGardenWin || active) return;
    setPreview(null);
    setDetails(false);
    const position = plants.findIndex(
      (p) => p.goal.id === c.latestGardenWin!.goalId,
    );
    if (position >= 0) setPlotPage(Math.floor(position / 8));
  }, [c.latestGardenWin?.id, active]);
  const win = !previewing ? c.latestGardenWin : null;
  async function complete(goal: Goal) {
    setNotice("");
    try {
      await c.toggleCompletion(goal.id);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <View style={styles.wrap}>
      {!active && (
        <View style={styles.top}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>
              {previewing ? "GARDEN PREVIEW" : "A LITTLE CARE, EVERY DAY"}
            </Text>
            <Text style={styles.title}>
              {previewing
                ? PREVIEWS[preview!]
                : today.done === today.total && today.total > 0
                  ? "Look at you grow."
                  : "Room to grow."}
            </Text>
            <Text style={styles.hint}>
              {previewing
                ? "Sample garden · your progress stays as it is"
                : plants.some((p) => p.stage > 0)
                  ? "Every small effort stays with you."
                  : "Your first small step plants a seed."}
            </Text>
          </View>
          <ProgressCircle
            done={shownDone}
            total={shownTotal}
            preview={previewing}
            onPress={() => {
              if (previewing) return;
              setDetails(!details);
            }}
          />
        </View>
      )}
      {win && !active && (
        <View accessibilityLiveRegion="polite" style={styles.winCard}>
          <Text style={styles.eyebrow}>A SMALL WIN, A LITTLE GROWTH</Text>
          <Text style={styles.winTitle}>{win.title} grew a little.</Text>
          <Text style={styles.hint}>
            +1 completed day · {win.after} {win.after === 1 ? "day" : "days"} of
            care. Your progress is saved.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep growing"
            onPress={c.dismissGardenWin}
            style={styles.winDismiss}
          >
            <Text style={styles.winLink}>Keep growing</Text>
            <Check size={16} color={colors.green} />
          </Pressable>
        </View>
      )}
      {details && !active ? (
        <View style={styles.details}>
          <View style={styles.detailHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Your garden
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close garden details"
              onPress={() => setDetails(false)}
              style={styles.close}
            >
              <X size={21} color={colors.green} />
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Each goal has its own plant. Completed days help it grow; missed
            days never take growth away.
          </Text>
          <ScrollView
            style={{ maxHeight: 340 }}
            nestedScrollEnabled
            contentContainerStyle={{ gap: 10 }}
          >
            {plants.map((p) => {
              const due = dueOn(p.goal, now, c.data.profile.timezone);
              const done = today.doneGoalIds.includes(p.goal.id);
              return (
                <View key={p.goal.id} style={styles.goal}>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={styles.goalTitle}>{p.goal.title}</Text>
                    <Text style={styles.hint}>
                      {KINDS[p.kind]} · {p.completions} completed{" "}
                      {p.completions === 1 ? "day" : "days"}
                    </Text>
                    <Text style={styles.hint}>
                      {GARDEN_STAGE_NAMES[p.stage]}
                      {p.goal.status === "paused"
                        ? " · Paused"
                        : !due
                          ? " · No step planned today"
                          : ""}
                    </Text>
                  </View>
                  {(due || done) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        done
                          ? `Undo today for ${p.goal.title}`
                          : `Mark ${p.goal.title} complete today`
                      }
                      disabled={c.busy}
                      onPress={() => void complete(p.goal)}
                      style={[styles.complete, done && styles.completed]}
                    >
                      <Check
                        size={22}
                        color={done ? "#FFFFFF" : colors.green}
                      />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
          {!plants.length && (
            <Button title="Choose your first goal" onPress={onPlan} />
          )}
          <Text style={styles.hint}>
            Sprout at 1 day · grow at 3 and 7 · flourish at 14. Your circle
            starts fresh each day; your garden keeps growing.
          </Text>
          {notice ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {notice}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.scene}>
          <FloatingGarden compact={active} plants={visuals} win={win} />
          {!active &&
            visible.map(
              (p, i) =>
                p.stage > 0 && (
                  <Pressable
                    key={p.goal.id}
                    accessibilityRole="button"
                    accessibilityLabel={`About ${p.goal.title}`}
                    onPress={() => {
                      if (!previewing) setDetails(true);
                    }}
                    style={[
                      styles.plantTag,
                      {
                        left: `${(PLOTS[i]!.x / 520) * 100}%`,
                        top: `${((PLOTS[i]!.y + 15) / 510) * 100}%`,
                      },
                    ]}
                  >
                    <Text numberOfLines={1} style={styles.tagText}>
                      {p.goal.title}
                    </Text>
                  </Pressable>
                ),
            )}
        </View>
      )}
      {!active && pageCount > 1 && (
        <View style={styles.pageControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous garden area"
            disabled={page === 0}
            onPress={() => setPlotPage(page - 1)}
            style={styles.close}
          >
            <ChevronLeft
              color={page === 0 ? colors.line : colors.green}
              size={20}
            />
          </Pressable>
          <Text style={styles.hint}>
            Garden {page + 1} of {pageCount}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next garden area"
            disabled={page === pageCount - 1}
            onPress={() => setPlotPage(page + 1)}
            style={styles.close}
          >
            <ChevronRight
              color={page === pageCount - 1 ? colors.line : colors.green}
              size={20}
            />
          </Pressable>
        </View>
      )}
      {children}
      {!active &&
        (previewing ? (
          <View style={styles.previewPanel}>
            <Text style={styles.eyebrow}>TRY THE GROWTH STAGES</Text>
            <View style={styles.stages}>
              {PREVIEWS.map((name, i) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected: preview === i }}
                  aria-pressed={preview === i}
                  onPress={() => setPreview(i as GardenStage)}
                  style={[styles.stage, preview === i && styles.chosen]}
                >
                  <Text
                    style={[
                      styles.stageNumber,
                      preview === i && { color: "#fff" },
                    ]}
                  >
                    {i + 1}
                  </Text>
                  <Text style={styles.stageLabel}>{name}</Text>
                </Pressable>
              ))}
            </View>
            <Button
              secondary
              title="Preview one more day"
              onPress={() => {
                const next = previewDays + 1;
                setPreviewDays(next);
                setPreviewStage(gardenStage(next));
              }}
            />
            <Text accessibilityLiveRegion="polite" style={styles.hint}>
              Preview: {previewDays} completed{" "}
              {previewDays === 1 ? "day" : "days"}. Each new day adds growth.
            </Text>
            <Text style={styles.hint}>
              In your garden, each plant grows independently with its goal.
            </Text>
            <Button
              secondary
              title="Back to my garden"
              onPress={() => {
                setPreview(null);
                setPlotPage(0);
              }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Preview garden growth"
            onPress={() => {
              setPreview(0);
              setDetails(false);
              setPlotPage(0);
            }}
            style={styles.previewLink}
          >
            <FlaskConical size={14} color={colors.muted} />
            <Text style={styles.previewText}>Preview garden growth</Text>
          </Pressable>
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  winCard: {
    width: "100%",
    backgroundColor: "#EDF0DE",
    borderColor: "#D9E2C9",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    marginTop: 14,
  },
  winTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "500",
    color: colors.ink,
  },
  winDismiss: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 36,
    alignSelf: "flex-start",
  },
  winLink: { color: colors.green, fontWeight: "600", fontSize: 12 },
  wrap: { width: "100%", alignItems: "center" },
  top: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8 },
  intro: { flex: 1, gap: 8 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: colors.green,
  },
  title: {
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: colors.ink,
    fontWeight: "500",
  },
  hint: { fontSize: 12, lineHeight: 19, color: colors.muted },
  ring: { width: 84, height: 84 },
  ringText: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  ratio: { fontSize: 23, fontWeight: "600", color: colors.green },
  ringLabel: { fontSize: 10, color: colors.muted },
  scene: { width: "100%", marginTop: -12, marginBottom: 7 },
  plantTag: {
    position: "absolute",
    transform: [{ translateX: -39 }],
    width: 78,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  tagText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#4B573E",
    backgroundColor: "#F2E5C8",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#D5C7A4",
    maxWidth: 78,
  },
  details: {
    width: "100%",
    marginTop: 16,
    marginBottom: 20,
    padding: 18,
    gap: 14,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  detailHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 21, color: colors.ink, fontWeight: "500" },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  goal: {
    paddingVertical: 10,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  goalTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  complete: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#B2C0A4",
    alignItems: "center",
    justifyContent: "center",
  },
  completed: { backgroundColor: colors.green, borderColor: colors.green },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  pageControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  previewText: { fontSize: 11, color: colors.muted },
  previewPanel: {
    width: "100%",
    padding: 17,
    borderRadius: 18,
    backgroundColor: "#EDEEE2",
    gap: 14,
    marginTop: 16,
  },
  stages: { flexDirection: "row", gap: 4, justifyContent: "space-between" },
  stage: {
    alignItems: "center",
    flex: 1,
    minHeight: 68,
    paddingTop: 7,
    gap: 7,
    borderRadius: 12,
  },
  chosen: { backgroundColor: "#DCE5D4" },
  stageNumber: {
    backgroundColor: "#BECAB2",
    color: colors.green,
    borderRadius: 13,
    width: 26,
    height: 26,
    textAlign: "center",
    lineHeight: 26,
    fontWeight: "600",
  },
  stageLabel: {
    fontSize: 10,
    textAlign: "center",
    color: colors.green,
    lineHeight: 14,
  },
});
