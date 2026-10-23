import React, { useState } from "react";
import { View, Text, Pressable, Switch } from "react-native";
import { Button, Field, Body, s, colors } from "./ui";
import type { Goal, EventDraft, Schedule } from "../lib/types";
import { wallTime, toInstant } from "../lib/dates";
export function GoalEditor({
  initial,
  onSave,
  busy = false,
}: {
  initial?: Pick<Goal, "title" | "steps" | "schedule">;
  onSave: (g: Pick<Goal, "title" | "steps" | "schedule">) => Promise<void>;
  busy?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<Schedule["kind"]>(
    initial?.schedule.kind ?? "daily",
  );
  const [days, setDays] = useState(initial?.schedule.days ?? [1]);
  const [steps, setSteps] = useState(initial?.steps.join("\n") ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <View style={s.stack}>
      <Field
        label="Goal"
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      <View style={s.row}>
        {(["daily", "weekly", "custom"] as const).map((k) => (
          <Button
            key={k}
            title={k}
            secondary={kind !== k}
            onPress={() => setKind(k)}
          />
        ))}
      </View>
      {kind !== "daily" && (
        <>
          <Body muted>
            {kind === "weekly"
              ? "Choose one day each week."
              : "Choose your days."}
          </Body>
          <View style={s.row}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <Pressable
                key={d}
                accessibilityRole="checkbox"
                accessibilityLabel={d}
                accessibilityState={{ checked: days.includes(i) }}
                onPress={() =>
                  setDays(
                    kind === "weekly"
                      ? [i]
                      : days.includes(i)
                        ? days.filter((x) => x !== i)
                        : [...days, i],
                  )
                }
                style={[
                  s.chip,
                  days.includes(i) && { backgroundColor: colors.peach },
                ]}
              >
                <Text>{d}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Field
        label="Small steps (one per line)"
        value={steps}
        onChangeText={setSteps}
        multiline
        maxLength={1200}
      />
      <Button
        title={saved ? "Saved" : "Save goal"}
        busy={busy}
        disabled={saved || !title.trim() || (kind !== "daily" && !days.length)}
        onPress={() =>
          onSave({
            title: title.trim(),
            steps: steps.split("\n").filter(Boolean).slice(0, 10),
            schedule: {
              kind,
              days:
                kind === "daily"
                  ? []
                  : kind === "weekly"
                    ? days.slice(0, 1)
                    : days,
            },
          })
            .then(() => setSaved(true))
            .catch(() => {})
        }
      />
    </View>
  );
}
export function EventEditor({
  draft,
  onSave,
  busy = false,
}: {
  draft: EventDraft;
  onSave: (e: EventDraft) => Promise<void>;
  busy?: boolean;
}) {
  const initial = wallTime(draft.starts_at, draft.timezone);
  const [title, setTitle] = useState(draft.title);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [reminder, setReminder] = useState(String(draft.reminder_minutes));
  const [duration, setDuration] = useState(String(draft.duration_minutes));
  const [post, setPost] = useState(draft.post_checkin);
  const [saved, setSaved] = useState(false);
  let when = "";
  let dateError = "";
  try {
    when = toInstant(date, time, draft.timezone);
  } catch (e) {
    dateError = (e as Error).message;
  }
  const valid =
    !!when &&
    Date.parse(when) > Date.now() &&
    Number.isInteger(+reminder) &&
    +reminder >= 0 &&
    +reminder <= 10080 &&
    Number.isInteger(+duration) &&
    +duration >= 1 &&
    +duration <= 1440 &&
    !!title.trim();
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>Your calendar · review first</Text>
      <Field
        label="Activity"
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      <Field
        label="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        placeholder="2026-10-21"
      />
      <Field
        label="Time (HH:MM, 24 hour)"
        value={time}
        onChangeText={setTime}
        placeholder="18:00"
      />
      <Body muted>
        {draft.timezone}
        {dateError ? ` · ${dateError}` : ""}
      </Body>
      <Field
        label="Duration in minutes"
        value={duration}
        onChangeText={setDuration}
        keyboardType="number-pad"
      />
      <Field
        label="Remind me this many minutes before"
        value={reminder}
        onChangeText={setReminder}
        keyboardType="number-pad"
      />
      <View style={s.row}>
        <Body>Gentle check-in afterward</Body>
        <Switch
          accessibilityLabel="Post activity check-in"
          value={post}
          onValueChange={setPost}
        />
      </View>
      <Button
        title={saved ? "Saved to calendar" : "Confirm & save event"}
        busy={busy}
        disabled={saved || !valid}
        onPress={() =>
          onSave({
            ...draft,
            title: title.trim(),
            starts_at: when,
            reminder_minutes: +reminder,
            duration_minutes: +duration,
            post_checkin: post,
          })
            .then(() => setSaved(true))
            .catch(() => {})
        }
      />
    </View>
  );
}
