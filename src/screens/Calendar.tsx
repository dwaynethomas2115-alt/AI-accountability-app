import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Body,
  Button,
  Card,
  Empty,
  Heading,
  s,
  colors,
} from "../components/ui";
import { EventEditor } from "../components/Editors";
import { useCompanion } from "../state/CompanionProvider";
import { localDate } from "../lib/types";
export function Calendar() {
  const c = useCompanion();
  const [adding, setAdding] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<string | null>(null);
  const date = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const key = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const events = c.data.events
    .filter(
      (e) =>
        !selected ||
        localDate(new Date(e.starts_at), c.data.profile.timezone) === selected,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  function shift(delta: number) {
    const next = new Date(year, month + delta, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
    setSelected(null);
  }
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>Make a little room</Text>
      <Heading>Your calendar</Heading>
      <Body muted>Plans can change. This space changes with you.</Body>
      <Card>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Button
            title="‹"
            label="Previous month"
            secondary
            onPress={() => shift(-1)}
          />
          <Text style={s.title}>
            {date.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </Text>
          <Button
            title="›"
            label="Next month"
            secondary
            onPress={() => shift(1)}
          />
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row" }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={s.small}>{d}</Text>
              </View>
            ))}
          </View>
          {Array.from(
            { length: Math.ceil((date.getDay() + count) / 7) },
            (_, row) => (
              <View key={row} style={{ flexDirection: "row" }}>
                {Array.from({ length: 7 }, (_, col) => {
                  const d = row * 7 + col - date.getDay() + 1;
                  if (d < 1 || d > count)
                    return <View key={col} style={{ flex: 1 }} />;
                  const has = c.data.events.some(
                    (e) =>
                      localDate(
                        new Date(e.starts_at),
                        c.data.profile.timezone,
                      ) === key(d),
                  );
                  return (
                    <Pressable
                      key={col}
                      accessibilityRole="button"
                      accessibilityLabel={`${key(d)}${has ? ", activities scheduled" : ""}`}
                      onPress={() =>
                        setSelected(selected === key(d) ? null : key(d))
                      }
                      style={{
                        flex: 1,
                        minHeight: 46,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 14,
                        backgroundColor:
                          selected === key(d) ? colors.sage : undefined,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.ink,
                          fontWeight: has ? "700" : "400",
                        }}
                      >
                        {d}
                      </Text>
                      <Text
                        style={{
                          height: 10,
                          color: colors.green,
                          fontSize: 10,
                        }}
                      >
                        {has ? "●" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ),
          )}
        </View>
      </Card>
      <Button
        title={adding ? "Close new activity" : "＋ Plan an activity"}
        secondary
        onPress={() => setAdding(!adding)}
      />
      {adding && (
        <Card>
          <EventEditor
            draft={{
              title: "",
              starts_at: new Date(Date.now() + 86400000).toISOString(),
              timezone: c.data.profile.timezone,
              duration_minutes: 30,
              reminder_minutes: 30,
              post_checkin: false,
            }}
            busy={c.busy}
            onSave={async (e) => {
              await c.saveEvent(e);
              setAdding(false);
            }}
          />
        </Card>
      )}
      {selected && (
        <Button
          title="Show all activities"
          secondary
          onPress={() => setSelected(null)}
        />
      )}
      <Text style={s.title}>{selected ?? "All activities"}</Text>
      {!events.length && (
        <Empty
          title="A little space to look forward to"
          text="Schedule an activity here or ask Kindred in chat. Nothing is saved until you confirm."
        />
      )}
      {events.map((e) => (
        <Card key={e.id}>
          <Text style={s.title}>{e.title}</Text>
          <Body>
            {new Date(e.starts_at).toLocaleString(undefined, {
              timeZone: e.timezone,
            })}{" "}
            · {e.timezone}
          </Body>
          <Body muted>
            {e.duration_minutes} minutes · reminder {e.reminder_minutes} minutes
            before{e.post_checkin ? " · check-in afterward" : ""}
          </Body>
          <Button
            title="Remove activity"
            secondary
            disabled={c.busy}
            onPress={() => c.deleteEvent(e.id).catch(() => {})}
          />
        </Card>
      ))}
      <Body muted>
        Reminders are sent by the backend to registered devices. Quiet hours and
        your daily limit apply. The local demo does not deliver notifications.
      </Body>
    </View>
  );
}
