import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { ArrowUp, Mic } from "lucide-react-native";
import { colors, s } from "../components/ui";
import { EventEditor } from "../components/Editors";
import type { Message } from "../lib/types";
import { useCompanion } from "../state/CompanionProvider";
export function Chat({ onTalk }: { onTalk: () => void }) {
  const c = useCompanion();
  const [text, setText] = useState("");
  const [pending, setPending] = useState("");
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [c.data.messages.length, pending]);
  async function send() {
    const message = text.trim();
    if (!message || c.busy || pending) return;
    setPending(message);
    setText("");
    try {
      await c.send(message);
    } catch {
      setText(message);
    } finally {
      setPending("");
    }
  }
  return (
    <View style={styles.page}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.messages}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
      >
        {!c.data.messages.length && (
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={styles.title}>
              A little space to talk.
            </Text>
            <Text style={styles.description}>How’s your day feeling?</Text>
          </View>
        )}
        {c.demo && <Text style={styles.demo}>Local demo · sample replies</Text>}
        {c.data.messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.bubble,
              m.role === "user" ? styles.mine : styles.theirs,
            ]}
          >
            <Text style={styles.message}>{m.content}</Text>
            <MessageActions message={m} />
          </View>
        ))}
        {pending && (
          <>
            <View style={[styles.bubble, styles.mine]}>
              <Text style={styles.message}>{pending}</Text>
            </View>
            <View style={styles.typing}>
              <ActivityIndicator size="small" color={colors.green} />
              <Text style={s.small}>Kindred is replying…</Text>
            </View>
          </>
        )}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message Kindred"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
          placeholder="Message Kindred…"
          placeholderTextColor="#7A877D"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={() => void send()}
          disabled={!text.trim() || c.busy || !!pending}
          style={[
            styles.send,
            (!text.trim() || c.busy || !!pending) && { opacity: 0.4 },
          ]}
        >
          <ArrowUp size={21} color="#FFFFFF" />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onTalk}
        style={styles.voice}
      >
        <Mic size={15} color={colors.muted} />
        <Text style={s.small}>Rather talk? Switch to voice</Text>
      </Pressable>
    </View>
  );
}
function MessageActions({ message }: { message: Message }) {
  const c = useCompanion();
  const [review, setReview] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);
  const proposal = message.proposal;
  if (!proposal) return null;
  const goalSaved = c.data.goals.some(
    (g) => g.source_message_id === message.id,
  );
  const eventSaved = c.data.events.some(
    (e) => e.source_message_id === message.id,
  );
  return (
    <>
      {proposal.goal && (
        <Pressable
          accessibilityRole="button"
          disabled={c.busy || goalSaved}
          onPress={() => c.addGoal(proposal.goal!, message.id).catch(() => {})}
          style={styles.save}
        >
          <Text style={styles.saveText}>
            {goalSaved
              ? "Added to your goals"
              : `Add “${proposal.goal.title}” to my goals`}
          </Text>
        </Pressable>
      )}
      {proposal.event && (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={eventSaved}
            onPress={() => setReview(!review)}
            style={styles.save}
          >
            <Text style={styles.saveText}>
              {eventSaved
                ? "Saved to your calendar"
                : review
                  ? "Close activity details"
                  : "Review suggested activity"}
            </Text>
          </Pressable>
          {review && !eventSaved && (
            <EventEditor
              draft={proposal.event}
              busy={c.busy}
              onSave={(event) => c.saveEvent(event, message.id)}
            />
          )}
        </>
      )}
      {proposal.memory && (
        <Pressable
          accessibilityRole="button"
          disabled={c.busy || memorySaved}
          onPress={() =>
            c
              .saveMemory(proposal.memory!)
              .then(() => setMemorySaved(true))
              .catch(() => {})
          }
          style={styles.save}
        >
          <Text style={styles.saveText}>
            {memorySaved ? "Memory saved" : `Remember: ${proposal.memory}`}
          </Text>
        </Pressable>
      )}
    </>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 680, alignSelf: "center" },
  messages: {
    paddingHorizontal: 22,
    paddingVertical: 25,
    gap: 14,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -0.8,
    color: colors.ink,
    fontWeight: "500",
    textAlign: "center",
  },
  description: { fontSize: 16, color: colors.muted },
  bubble: {
    maxWidth: "88%",
    paddingHorizontal: 17,
    paddingVertical: 13,
    borderRadius: 21,
  },
  mine: {
    alignSelf: "flex-end",
    backgroundColor: colors.sage,
    borderBottomRightRadius: 6,
  },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  message: { fontSize: 16, lineHeight: 25, color: colors.ink },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginHorizontal: 20,
    padding: 9,
    paddingLeft: 17,
    backgroundColor: colors.card,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 140,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
    paddingTop: 6,
    paddingBottom: 6,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  voice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    paddingVertical: 12,
  },
  demo: { fontSize: 11, color: colors.muted, textAlign: "center" },
  typing: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
  save: {
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  saveText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.green,
    fontWeight: "600",
  },
});
