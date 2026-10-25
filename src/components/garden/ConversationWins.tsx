import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, ChevronRight, Sprout } from "lucide-react-native";
import { colors } from "../ui";
import { localDate } from "../../lib/types";
import { useCompanion } from "../../state/CompanionProvider";

/** A conversation is an invitation to reflect, never evidence of completion. */
export function ConversationWins({
  initiallyOpen = false,
  onRecorded,
  onDismiss,
}: {
  initiallyOpen?: boolean;
  onRecorded: () => void;
  onDismiss?: () => void;
}) {
  const c = useCompanion();
  const [open, setOpen] = useState(initiallyOpen);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const goals = c.data.goals.filter((goal) => goal.status === "active");
  const today = localDate(now, c.data.profile.timezone);
  const done = new Set(
    c.data.completions
      .filter((completion) => completion.local_date === today)
      .map((completion) => completion.goal_id),
  );
  if (!goals.length) return null;
  async function record(goalId: string) {
    if (locked.current || c.busy || done.has(goalId)) return;
    locked.current = true;
    setSaving(goalId);
    setError("");
    try {
      // Explicit user confirmation; the provider enforces account ownership and
      // one completion per goal/local day even if this is tapped more than once.
      await c.recordCompletion(goalId);
      onRecorded();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "That step could not be saved. Please try again.",
      );
    } finally {
      locked.current = false;
      setSaving(null);
    }
  }
  if (!open)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record a small win"
        onPress={() => setOpen(true)}
        style={styles.entry}
      >
        <Sprout size={17} color={colors.green} />
        <Text style={styles.entryText}>Record a small win</Text>
        <ChevronRight size={16} color={colors.green} />
      </Pressable>
    );
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        A small win to bring back?
      </Text>
      <Text style={styles.note}>
        Choose a goal you worked on today. Your garden grows when you confirm a
        completed step.
      </Text>
      {goals.map((goal) => {
        const recorded = done.has(goal.id);
        return (
          <Pressable
            key={goal.id}
            accessibilityRole="button"
            accessibilityLabel={
              recorded
                ? `${goal.title} already recorded today`
                : `Record ${goal.title} for today`
            }
            disabled={recorded || c.busy || !!saving}
            onPress={() => void record(goal.id)}
            style={[styles.goal, recorded && styles.recorded]}
          >
            <View style={styles.goalText}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <Text style={styles.hint}>
                {recorded ? "Already recorded today" : "I did this today"}
              </Text>
            </View>
            {saving === goal.id ? (
              <ActivityIndicator color={colors.green} />
            ) : (
              <Check size={19} color={recorded ? colors.muted : colors.green} />
            )}
          </Pressable>
        );
      })}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not today — keep my garden as it is"
        disabled={!!saving}
        onPress={() => {
          setOpen(false);
          setError("");
          onDismiss?.();
        }}
        style={styles.dismiss}
      >
        <Text style={styles.hint}>Not today. That’s okay.</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  entry: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    marginVertical: 5,
  },
  entryText: { fontSize: 13, fontWeight: "500", color: colors.green },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 18,
    gap: 13,
    borderWidth: 1,
    borderColor: "#DCE4D5",
    backgroundColor: "#F0F3E9",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "500",
    color: colors.ink,
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  note: { fontSize: 13, lineHeight: 21, color: colors.muted },
  goal: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recorded: { opacity: 0.6 },
  goalText: { flex: 1, gap: 4 },
  goalTitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: colors.ink,
  },
  hint: { fontSize: 12, lineHeight: 19, color: colors.muted },
  dismiss: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 13, lineHeight: 20, color: colors.danger },
});
