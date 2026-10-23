import React, { useState } from "react";
import { View, Text, Switch } from "react-native";
import { Body, Button, Card, Field, Heading, s } from "../components/ui";
import { useCompanion } from "../state/CompanionProvider";
import { registerPush } from "../lib/notifications";
export function Settings() {
  const c = useCompanion();
  const [p, setP] = useState(c.data.profile);
  const [memory, setMemory] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const [notice, setNotice] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  let tzValid = true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: p.timezone });
  } catch {
    tzValid = false;
  }
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>Always your choice</Text>
      <Heading>Your space</Heading>
      <Body muted>
        Support should fit your life. Set the pace that feels right.
      </Body>
      <Card>
        <Field
          label="Your name"
          value={p.display_name}
          onChangeText={(display_name) => setP({ ...p, display_name })}
        />
        <Field
          label="Timezone (IANA name)"
          value={p.timezone}
          autoCapitalize="none"
          onChangeText={(timezone) => setP({ ...p, timezone })}
        />
        <View style={s.row}>
          <Body>Daily gentle check-in</Body>
          <Switch
            accessibilityLabel="Enable daily check-ins"
            value={p.checkins_enabled}
            onValueChange={(checkins_enabled) =>
              setP({ ...p, checkins_enabled })
            }
          />
        </View>
        <Field
          label="Check-in time (HH:MM, 24 hour)"
          value={p.checkin_time.slice(0, 5)}
          onChangeText={(checkin_time) => setP({ ...p, checkin_time })}
        />
        <Field
          label="Quiet hours start (HH:MM)"
          value={p.quiet_start.slice(0, 5)}
          onChangeText={(quiet_start) => setP({ ...p, quiet_start })}
        />
        <Field
          label="Quiet hours end (HH:MM)"
          value={p.quiet_end.slice(0, 5)}
          onChangeText={(quiet_end) => setP({ ...p, quiet_end })}
        />
        <Field
          label="Maximum notifications per day (0–5)"
          value={String(p.daily_limit)}
          keyboardType="number-pad"
          onChangeText={(v) =>
            setP({ ...p, daily_limit: v === "" ? NaN : Number(v) })
          }
        />
        <Body muted>
          The limit covers activity reminders and check-ins together. Matching
          quiet-hour times mean no quiet window. Nothing is sent during quiet
          hours; expired reminders are skipped.
        </Body>
        <Button
          title="Save preferences"
          busy={c.busy}
          disabled={
            !p.display_name.trim() ||
            !tzValid ||
            ![p.checkin_time, p.quiet_start, p.quiet_end].every((v) =>
              time.test(v.slice(0, 5)),
            ) ||
            !Number.isInteger(p.daily_limit) ||
            p.daily_limit < 0 ||
            p.daily_limit > 5
          }
          onPress={() =>
            c
              .saveProfile(p)
              .then(() => setNotice("Your preferences are saved."))
              .catch(() => {})
          }
        />
        <Button
          title="Enable notifications on this device"
          secondary
          busy={pushBusy}
          disabled={c.demo}
          onPress={() => {
            setPushBusy(true);
            registerPush()
              .then(() => setNotice("This device is ready for reminders."))
              .catch((e) => setNotice(e.message))
              .finally(() => setPushBusy(false));
          }}
        />
        {notice && <Body>{notice}</Body>}
      </Card>
      <Card>
        <Text style={s.title}>What Kindred remembers</Text>
        <Body muted>
          Only memories you approve are saved here. Recent chat history also
          provides context. You can clear it below.
        </Body>
        {c.data.memories.map((m) => (
          <View key={m.id} style={s.stack}>
            <Body>{m.content}</Body>
            <View style={s.row}>
              <Button
                title="Correct"
                secondary
                onPress={() => {
                  setMemory(m.content);
                  setEditing(m.id);
                }}
              />
              <Button
                title="Forget"
                secondary
                disabled={c.busy}
                onPress={() => c.deleteMemory(m.id).catch(() => {})}
              />
            </View>
          </View>
        ))}
        {!c.data.memories.length && <Body muted>No saved memories yet.</Body>}
        <Field
          label={
            editing ? "Correct this memory" : "Something you’d like remembered"
          }
          value={memory}
          onChangeText={setMemory}
          multiline
          maxLength={1000}
        />
        <Button
          title={editing ? "Save correction" : "Remember this"}
          disabled={!memory.trim() || c.busy}
          secondary
          onPress={() =>
            c
              .saveMemory(memory, editing)
              .then(() => {
                setMemory("");
                setEditing(undefined);
              })
              .catch(() => {})
          }
        />
        {editing && (
          <Button
            title="Cancel correction"
            secondary
            onPress={() => {
              setMemory("");
              setEditing(undefined);
            }}
          />
        )}
      </Card>
      <Card>
        <Text style={s.title}>Conversation history</Text>
        <Body muted>
          Clearing history removes saved messages from future chat context.
          Approved memories stay until you forget them above.
        </Body>
        <Button
          title={
            clearConfirm
              ? "Confirm: clear all chat history"
              : "Clear chat history"
          }
          secondary
          disabled={c.busy}
          onPress={() => {
            if (!clearConfirm) setClearConfirm(true);
            else
              c.clearHistory()
                .then(() => {
                  setClearConfirm(false);
                  setNotice("Chat history cleared.");
                })
                .catch(() => {});
          }}
        />
      </Card>
      <Button
        title={c.demo ? "Leave local demo" : "Sign out"}
        secondary
        onPress={() => c.signOut().catch(() => {})}
      />
    </View>
  );
}
