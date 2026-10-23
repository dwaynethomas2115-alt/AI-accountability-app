import React, { useState } from "react";
import { View, Text } from "react-native";
import {
  Body,
  Button,
  Card,
  Empty,
  Heading,
  s,
  colors,
} from "../components/ui";
import { GoalEditor } from "../components/Editors";
import { useCompanion } from "../state/CompanionProvider";
import { localDate, progress, dueOn } from "../lib/types";
export function Dashboard({ openChat }: { openChat: () => void }) {
  const c = useCompanion();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { profile, goals, completions, events } = c.data;
  const p = progress(goals, completions, profile.timezone);
  const today = localDate(new Date(), profile.timezone);
  const upcoming = events
    .filter((e) => Date.parse(e.starts_at) > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 2);
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>A fresh little beginning</Text>
      <Heading>Hello, {profile.display_name}.</Heading>
      <Body muted>There’s room for a small step today.</Body>
      <Card accent>
        <View style={s.row}>
          <Text style={{ fontSize: 42, color: colors.green }}>✳</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>
              {p.done > 0
                ? "Look at you, showing up."
                : "Your pace is a good pace."}
            </Text>
            <Body>
              {p.total
                ? `${p.done} of ${p.total} planned steps today`
                : "Nothing scheduled today. A little breathing room."}
            </Body>
          </View>
        </View>
        <View
          style={{
            height: 7,
            borderRadius: 5,
            backgroundColor: "#C7D6C5",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 7,
              width: `${p.total ? (p.done / p.total) * 100 : 0}%`,
              backgroundColor: colors.green,
            }}
          />
        </View>
        <Button title="Talk it through with Kindred" onPress={openChat} />
      </Card>
      <View style={s.row}>
        <Text style={[s.title, { flex: 1 }]}>Your small promises</Text>
        <Button
          title={adding ? "Close" : "＋ Goal"}
          secondary
          onPress={() => setAdding(!adding)}
        />
      </View>
      {adding && (
        <Card>
          <GoalEditor
            onSave={async (g) => {
              await c.addGoal(g);
              setAdding(false);
            }}
            busy={c.busy}
          />
        </Card>
      )}
      {!goals.length && (
        <Empty
          title="Start with something that matters"
          text="Add a goal here, or tell Kindred what you’d like to work toward."
        />
      )}
      {goals.map((g) => {
        const done = completions.some(
          (x) => x.goal_id === g.id && x.local_date === today,
        );
        return (
          <Card key={g.id}>
            <Text style={s.title}>{g.title}</Text>
            <Body muted>
              {g.status === "paused"
                ? "Paused · here when you’re ready"
                : g.schedule.kind === "daily"
                  ? "A little each day"
                  : g.schedule.days
                      .map(
                        (d) =>
                          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
                      )
                      .join(", ")}
              {dueOn(g, new Date(), profile.timezone) ? " · planned today" : ""}
            </Body>
            {g.steps.map((step, i) => (
              <Body key={i}>· {step}</Body>
            ))}
            <View style={s.row}>
              {g.status === "active" && (
                <Button
                  title={done ? "✓ Done today · undo" : "Mark today complete"}
                  secondary={done}
                  disabled={c.busy}
                  onPress={() => c.toggleCompletion(g.id).catch(() => {})}
                />
              )}
              <Button
                title={g.status === "paused" ? "Resume" : "Pause"}
                secondary
                disabled={c.busy}
                onPress={() =>
                  c
                    .editGoal(g.id, {
                      status: g.status === "paused" ? "active" : "paused",
                    })
                    .catch(() => {})
                }
              />
              <Button
                title={editing === g.id ? "Close editor" : "Edit"}
                secondary
                onPress={() => setEditing(editing === g.id ? null : g.id)}
              />
            </View>
            {editing === g.id && (
              <>
                <GoalEditor
                  initial={g}
                  busy={c.busy}
                  onSave={async (v) => {
                    await c.editGoal(g.id, {
                      title: v.title,
                      steps: v.steps,
                      schedule: v.schedule,
                    });
                    setEditing(null);
                  }}
                />
                <Button
                  title="Delete goal and its progress"
                  secondary
                  disabled={c.busy}
                  onPress={() => c.deleteGoal(g.id).catch(() => {})}
                />
              </>
            )}
          </Card>
        );
      })}
      <Text style={s.title}>Coming up</Text>
      {upcoming.length ? (
        upcoming.map((e) => (
          <Card key={e.id}>
            <Text style={s.title}>{e.title}</Text>
            <Body muted>
              {new Date(e.starts_at).toLocaleString(undefined, {
                timeZone: profile.timezone,
              })}
            </Body>
          </Card>
        ))
      ) : (
        <Body muted>
          Your calendar has a little space. Plan something kind for yourself.
        </Body>
      )}
      <Card>
        <Text style={s.title}>This week, in little steps</Text>
        <Body>
          {
            completions.filter((x) => {
              const delta =
                (Date.parse(today) - Date.parse(x.local_date)) / 86400000;
              return delta >= 0 && delta < 7;
            }).length
          }{" "}
          completed steps in the last seven days.
        </Body>
        <Body muted>
          Every effort counts. A missed day is information, never a verdict.
        </Body>
      </Card>
    </View>
  );
}
