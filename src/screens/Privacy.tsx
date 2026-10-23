import React, { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { Pencil, Trash2, ArrowUpRight, LogOut } from "lucide-react-native";
import { colors, s, Button, Body } from "../components/ui";
import { useCompanion } from "../state/CompanionProvider";
export function PrivacyScreen({
  onCalendar,
  onSignOut,
}: {
  onCalendar: () => void;
  onSignOut: () => Promise<void>;
}) {
  const c = useCompanion();
  const [edit, setEdit] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>
        Always your space.
      </Text>
      <Body muted>You choose what stays, and what you’d like to let go.</Body>
      <View style={styles.section}>
        <Text style={styles.label}>What Kindred remembers</Text>
        {c.data.memories.length ? (
          c.data.memories.map((m) => (
            <View key={m.id} style={styles.memory}>
              {edit === m.id ? (
                <>
                  <TextInput
                    accessibilityLabel="Correct this memory"
                    value={value}
                    onChangeText={setValue}
                    multiline
                    maxLength={1000}
                    style={s.input}
                  />
                  <Button
                    title="Save correction"
                    busy={c.busy}
                    onPress={() =>
                      c
                        .saveMemory(value, m.id)
                        .then(() => setEdit(null))
                        .catch(() => {})
                    }
                  />
                </>
              ) : (
                <>
                  <Body>{m.content}</Body>
                  <View style={s.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Correct memory"
                      onPress={() => {
                        setEdit(m.id);
                        setValue(m.content);
                      }}
                      style={styles.smallButton}
                    >
                      <Pencil size={16} color={colors.muted} />
                      <Text style={s.small}>Correct</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Forget memory"
                      disabled={c.busy}
                      onPress={() => c.deleteMemory(m.id).catch(() => {})}
                      style={styles.smallButton}
                    >
                      <Trash2 size={16} color={colors.muted} />
                      <Text style={s.small}>Forget</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ))
        ) : (
          <Text style={styles.note}>
            No saved memories yet. Recent conversations also help Kindred pick
            up where you left off.
          </Text>
        )}
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Conversation history</Text>
        <Text style={styles.note}>
          Text messages and voice transcripts provide context for future
          conversations. Raw voice recordings are not saved by this app.
        </Text>
        {c.data.voiceSessions.slice(0, 3).map((v) => (
          <View key={v.id} style={styles.history}>
            <Text style={s.small}>
              Voice · {new Date(v.created_at).toLocaleDateString()}
            </Text>
            <Text style={styles.note}>
              {v.transcript
                .filter((t) => t.role === "user")
                .map((t) => t.content)
                .join(" ")
                .slice(0, 180) || "A moment together."}
            </Text>
          </View>
        ))}
        <Button
          title={
            confirm
              ? "Confirm: clear conversation history"
              : "Clear conversation history"
          }
          secondary
          disabled={c.busy}
          onPress={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            c.clearHistory()
              .then(() => {
                setConfirm(false);
                setNotice("Your conversation history has been cleared.");
              })
              .catch(() => {});
          }}
        />
        <Text style={styles.note}>
          Approved memories remain until you forget them above. Clearing history
          does not remove requests already processed by the AI service.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onCalendar}
        style={styles.link}
      >
        <Text style={styles.label}>Your saved activities</Text>
        <ArrowUpRight size={18} color={colors.muted} />
      </Pressable>
      {notice && <Body>{notice}</Body>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={c.demo ? "Leave demo" : "Sign out"}
        disabled={c.busy}
        onPress={() => onSignOut().catch((e) => setNotice(e.message))}
        style={styles.signout}
      >
        <LogOut size={17} color={colors.muted} />
        <Text style={s.small}>{c.demo ? "Leave demo" : "Sign out"}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: 22, maxWidth: 520, width: "100%", alignSelf: "center" },
  title: {
    fontSize: 31,
    lineHeight: 39,
    color: colors.ink,
    fontWeight: "500",
    letterSpacing: -1,
  },
  label: { fontSize: 17, fontWeight: "600", color: colors.ink },
  note: { fontSize: 14, lineHeight: 23, color: colors.muted },
  section: { gap: 16, paddingVertical: 9 },
  memory: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 17,
    gap: 12,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 8,
  },
  history: {
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: colors.line,
    minHeight: 58,
  },
  signout: {
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },
});
