import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Mic, ArrowRight, Check } from "lucide-react-native";
import { useCompanion } from "../state/CompanionProvider";
import { colors, s, Button, Body } from "../components/ui";
import {
  CHECKIN_PRESETS,
  describeCheckinDays,
  formatCheckinTime,
} from "../lib/plan";
export function parseFriendlyTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
export function PlanScreen({
  onDone,
  onTalk,
  onPrivacy,
}: {
  onDone: () => void;
  onTalk: () => void;
  onPrivacy: () => void;
}) {
  const c = useCompanion();
  const initial = c.data.profile;
  const [goals, setGoals] = useState(
    c.data.goals
      .filter((g) => g.status === "active")
      .map((g) => g.title)
      .join("\n"),
  );
  const [time, setTime] = useState(formatCheckinTime(initial.checkin_time));
  const [days, setDays] = useState(initial.checkin_days);
  const [notice, setNotice] = useState("");
  const first = !initial.onboarded;
  async function save() {
    const parsed = parseFriendlyTime(time);
    if (!parsed) {
      setNotice("Try a time like 6:00 PM or 18:00.");
      return;
    }
    setNotice("");
    try {
      await c.savePlan({
        goals: goals
          .split("\n")
          .map((g) => g.trim())
          .filter(Boolean),
        checkin_time: parsed,
        checkin_days: days,
        timezone: initial.timezone,
      });
      onDone();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <View style={styles.wrap}>
      <Text style={s.eyebrow}>
        {first ? "Let’s make a little room" : "Your simple plan"}
      </Text>
      <Text accessibilityRole="header" style={styles.title}>
        {first ? "Just three little things." : "A plan that fits your life."}
      </Text>
      <Body muted>
        What matters to you, when you’re free, and a pace that feels good.
      </Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Set up my plan by voice"
        onPress={onTalk}
        style={styles.voiceLink}
      >
        <Mic size={19} color={colors.green} />
        <Text style={styles.voiceText}>Rather talk it through? I’m here.</Text>
        <ArrowRight size={18} color={colors.green} />
      </Pressable>
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>What are you working toward?</Text>
          <TextInput
            accessibilityLabel="Your goals"
            placeholder="Walk more. Get better sleep. Make time for myself."
            placeholderTextColor="#7C877C"
            multiline
            value={goals}
            onChangeText={setGoals}
            maxLength={804}
            style={[s.input, styles.goalInput]}
          />
          <Text style={styles.hint}>
            One goal per line. Small is a good place to start.
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>When are you usually free?</Text>
          <TextInput
            accessibilityLabel="Your check-in time"
            value={time}
            onChangeText={setTime}
            placeholder="6:00 PM"
            autoCapitalize="characters"
            style={[s.input, styles.timeInput]}
          />
          <Text style={styles.hint}>
            {initial.timezone.replaceAll("_", " ")} · your local time
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>How often shall we check in?</Text>
          <View accessibilityRole="radiogroup" style={styles.frequencies}>
            {CHECKIN_PRESETS.map((p) => {
              const chosen = days.join(",") === p.days.join(",");
              return (
                <Pressable
                  key={p.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  aria-checked={chosen}
                  onPress={() => setDays([...p.days])}
                  style={[styles.frequency, chosen && styles.selected]}
                >
                  <Text
                    style={[
                      styles.frequencyText,
                      chosen && { color: colors.green, fontWeight: "600" },
                    ]}
                  >
                    {p.label}
                  </Text>
                  {chosen ? (
                    <Check size={17} color={colors.green} />
                  ) : (
                    <View style={{ width: 17 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
          {!CHECKIN_PRESETS.some(
            (p) => p.days.join(",") === days.join(","),
          ) && <Text style={styles.hint}>{describeCheckinDays(days)}</Text>}
        </View>
      </View>
      {notice ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {notice}
        </Text>
      ) : null}
      <Button
        title={first ? "That sounds good" : "Save my plan"}
        busy={c.busy}
        disabled={!goals.trim()}
        onPress={() => void save()}
      />
      <Text style={styles.note}>
        For now, open Kindred at your chosen time. You can always talk sooner.
        There are no automatic calls.
      </Text>
      {!first && (
        <Pressable
          accessibilityRole="button"
          onPress={onPrivacy}
          style={styles.privacy}
        >
          <Text style={styles.hint}>Memory, history & account</Text>
          <ArrowRight size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    gap: 19,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingBottom: 24,
  },
  title: {
    fontSize: 31,
    lineHeight: 39,
    fontWeight: "600",
    letterSpacing: -1,
    color: colors.ink,
  },
  voiceLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 15,
  },
  voiceText: { flex: 1, fontSize: 15, color: colors.green },
  form: { gap: 25, paddingVertical: 7 },
  field: { gap: 10 },
  label: { fontSize: 16, fontWeight: "600", color: colors.ink },
  goalInput: {
    minHeight: 110,
    textAlignVertical: "top",
    lineHeight: 25,
    backgroundColor: colors.card,
  },
  timeInput: { fontSize: 24, fontWeight: "500", paddingVertical: 15 },
  hint: { fontSize: 12, lineHeight: 19, color: colors.muted },
  frequencies: { gap: 7 },
  frequency: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: { borderColor: "#A9BEAA", backgroundColor: "#E8EEE2" },
  frequencyText: { fontSize: 15, color: colors.muted },
  note: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 21,
    textAlign: "center",
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  privacy: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 46,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 14,
  },
});
