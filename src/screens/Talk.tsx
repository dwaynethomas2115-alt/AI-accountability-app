import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  Mic,
  MicOff,
  PhoneOff,
  MessageCircle,
  Clock3,
} from "lucide-react-native";
import { colors, s, Button } from "../components/ui";
import { ConversationWins } from "../components/garden/ConversationWins";
import { GardenHome } from "../components/garden/GardenHome";
import { useCompanion } from "../state/CompanionProvider";
import { nextCheckin, formatCheckinTime } from "../lib/plan";
import type { useVoiceConversation } from "../hooks/useVoiceConversation";
type Voice = ReturnType<typeof useVoiceConversation>;
export function TalkScreen({
  voice,
  onMessages,
  onPlan,
  onShowForest,
}: {
  voice: Voice;
  onMessages: () => void;
  onPlan: () => void;
  onShowForest?: () => void;
}) {
  const c = useCompanion();
  const [now, setNow] = useState(new Date());
  const [demoNotice, setDemoNotice] = useState(false);
  const [reviewWin, setReviewWin] = useState(false);
  const wasTalking = useRef(false);
  useEffect(() => {
    const hadUserSpeech = voice.transcripts.some(
      (turn) => turn.role === "user" && turn.final && turn.content.trim(),
    );
    if (wasTalking.current && !voice.active && hadUserSpeech && !voice.error)
      setReviewWin(true);
    if (voice.active) setReviewWin(false);
    wasTalking.current = voice.active;
  }, [voice.active, voice.transcripts, voice.error]);
  useEffect(() => {
    setReviewWin(false);
    setDemoNotice(false);
    wasTalking.current = false;
  }, [c.session?.user.id, c.demo]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const goals = c.data.goals.filter((g) => g.status === "active");
  const p = c.data.profile;
  let next: Date | null = null;
  try {
    if (goals.length)
      next = nextCheckin(
        {
          goals: goals.slice(0, 5).map((g) => g.title),
          checkin_time: p.checkin_time,
          checkin_days: p.checkin_days,
          timezone: p.timezone,
        },
        now,
      );
  } catch {}
  const last = voice.transcripts.filter((t) => t.content.trim()).at(-1);
  const label = voice.muted
    ? "Microphone paused"
    : voice.status === "connecting"
      ? "Making a little space…"
      : voice.status === "speaking"
        ? "Kindred is speaking"
        : voice.status === "thinking"
          ? "A moment to think…"
          : "I’m listening";
  const ended = !voice.active && voice.transcripts.length > 0;
  const minutes = Math.floor(voice.elapsedSeconds / 60);
  const seconds = voice.elapsedSeconds % 60;
  return (
    <View style={styles.page}>
      <GardenHome
        active={voice.active}
        onPlan={onPlan}
        onShowForest={onShowForest}
        checkinSummary={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit my check-in plan"
            accessibilityHint={
              next
                ? `Next check-in ${next.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: p.timezone })} at ${formatCheckinTime(p.checkin_time)}`
                : "Choose a time to talk"
            }
            onPress={onPlan}
            style={styles.checkin}
          >
            <Clock3 size={13} strokeWidth={1.5} color={colors.muted} />
            <Text style={styles.checkinTime} numberOfLines={1}>
              {next
                ? `${next.toLocaleDateString(undefined, { weekday: "short", timeZone: p.timezone })} · ${formatCheckinTime(p.checkin_time)}`
                : "Choose a check-in time"}
            </Text>
          </Pressable>
        }
        conversationFeedback={
          voice.audioBlocked ||
          voice.error ||
          voice.saveError ||
          (!voice.supported && !c.demo) ||
          demoNotice ||
          voice.pendingPlan ? (
            <>
              {voice.audioBlocked && (
                <Button
                  title="Tap to hear Kindred"
                  secondary
                  onPress={() => void voice.resumeAudio()}
                />
              )}
              <View accessibilityLiveRegion="polite">
                {voice.error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {voice.error}
                  </Text>
                )}
                {voice.saveError && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {voice.saveError}
                  </Text>
                )}
                {!voice.supported && !c.demo && (
                  <Text style={styles.error}>
                    Voice needs microphone access in a supported browser or the
                    latest mobile build.
                  </Text>
                )}
                {demoNotice && (
                  <>
                    <Text style={styles.demo}>
                      This is a sample space. Sign in to have a real voice
                      conversation—your microphone hasn’t been opened.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss demo voice notice"
                      onPress={() => setDemoNotice(false)}
                      style={styles.typeLink}
                    >
                      <Text style={styles.typeText}>Got it</Text>
                    </Pressable>
                  </>
                )}
              </View>
              {voice.pendingPlan && (
                <View style={styles.proposal}>
                  <Text style={s.eyebrow}>Does this feel right?</Text>
                  <Text style={styles.proposalText}>
                    {voice.pendingPlan.summary}
                  </Text>
                  <Text style={styles.anytime}>
                    Say “yes, save that” or tap below.
                  </Text>
                  <Button
                    title="Save this plan"
                    busy={c.busy}
                    onPress={() => void voice.confirmPlan()}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={voice.dismissPlan}
                    style={styles.typeLink}
                  >
                    <Text style={styles.typeText}>
                      Not quite—let’s change it
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : undefined
        }
        conversationReview={
          reviewWin && !voice.active && goals.length > 0 ? (
            <ConversationWins
              initiallyOpen
              onRecorded={() => setReviewWin(false)}
              onDismiss={() => setReviewWin(false)}
            />
          ) : undefined
        }
      >
        {voice.active ? (
          <>
            <View style={styles.listening}>
              <View
                style={[
                  styles.dot,
                  voice.muted && { backgroundColor: "#8C978A" },
                ]}
              />
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                {label}
              </Text>
              <Text style={styles.timer}>
                {minutes}:{String(seconds).padStart(2, "0")}
              </Text>
            </View>
            <View style={styles.caption}>
              <Text style={styles.captionRole}>
                {last?.role === "user" ? "You" : "Kindred"}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={styles.captionText}
                numberOfLines={5}
              >
                {last?.content || "Say hello when you’re ready."}
              </Text>
            </View>
            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  voice.muted ? "Unmute microphone" : "Mute microphone"
                }
                accessibilityState={{ selected: voice.muted }}
                aria-pressed={voice.muted}
                onPress={voice.toggleMute}
                style={[
                  styles.roundControl,
                  voice.muted && { backgroundColor: colors.sage },
                ]}
              >
                {voice.muted ? (
                  <MicOff size={23} color={colors.green} />
                ) : (
                  <Mic size={23} color={colors.green} />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="End conversation"
                onPress={() => void voice.end()}
                style={styles.endButton}
              >
                <PhoneOff size={21} color="white" />
                <Text style={styles.endText}>End conversation</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Let’s talk"
              disabled={!voice.supported && !c.demo}
              onPress={() => {
                if (c.demo) {
                  setDemoNotice(true);
                  return;
                }
                setDemoNotice(false);
                void voice.start();
              }}
              style={({ pressed }) => [
                styles.talkButton,
                pressed && { opacity: 0.85 },
                !voice.supported && !c.demo && { opacity: 0.5 },
              ]}
            >
              <Mic size={22} color="white" />
              <Text style={styles.talkText}>
                {ended ? "Talk again" : "Let’s talk"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onMessages}
              style={[styles.typeLink, styles.textAlternative]}
            >
              <MessageCircle size={17} color={colors.muted} />
              <Text style={styles.typeText}>Type instead</Text>
            </Pressable>
          </>
        )}
      </GardenHome>
      {!voice.active && (
        <Text style={styles.disclosure}>
          An AI voice, a space to be yourself. Conversations are transcribed so
          Kindred can remember where you left off.
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    alignItems: "center",
    paddingTop: 0,
    paddingBottom: 0,
  },
  talkButton: {
    backgroundColor: colors.green,
    borderRadius: 27,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    boxShadow: "0 4px 14px rgba(26,67,48,0.12)",
  },
  talkText: { fontSize: 16, color: "#fff", fontWeight: "600" },
  anytime: {
    fontSize: 12,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
    marginTop: 12,
  },
  typeLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 15,
  },
  textAlternative: {
    backgroundColor: "rgba(235,239,228,0.8)",
    borderRadius: 25,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  typeText: { fontSize: 12, color: colors.green },
  checkin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  checkinTime: { fontSize: 11, color: colors.muted, flexShrink: 1 },
  disclosure: {
    fontSize: 11,
    lineHeight: 18,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 20,
    marginVertical: 14,
    maxWidth: 420,
  },
  listening: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.green },
  status: { fontSize: 14, color: colors.green, fontWeight: "500" },
  timer: {
    fontSize: 12,
    color: colors.muted,
    marginLeft: 4,
    fontVariant: ["tabular-nums"],
  },
  caption: { minHeight: 115, paddingVertical: 18, gap: 8, width: "100%" },
  captionRole: { fontSize: 11, color: colors.muted, textAlign: "center" },
  captionText: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.ink,
    textAlign: "center",
  },
  controls: {
    width: "100%",
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  roundControl: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  endButton: {
    flexShrink: 1,
    minHeight: 54,
    backgroundColor: "#8F5147",
    borderRadius: 27,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  endText: { flexShrink: 1, fontSize: 15, fontWeight: "600", color: "white" },
  error: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    color: colors.danger,
    maxWidth: 360,
  },
  demo: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 360,
  },
  proposal: {
    width: "100%",
    gap: 12,
  },
  proposalText: { fontSize: 16, lineHeight: 25, color: colors.ink },
});
