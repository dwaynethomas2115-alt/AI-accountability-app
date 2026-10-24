import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  Mic,
  MicOff,
  PhoneOff,
  MessageCircle,
  Clock3,
  ArrowUpRight,
} from "lucide-react-native";
import { colors, s, Button } from "../components/ui";
import { GardenHome } from "../components/garden/GardenHome";
import { useCompanion } from "../state/CompanionProvider";
import { nextCheckin, formatCheckinTime } from "../lib/plan";
import type { useVoiceConversation } from "../hooks/useVoiceConversation";
type Voice = ReturnType<typeof useVoiceConversation>;
export function TalkScreen({
  voice,
  onMessages,
  onPlan,
}: {
  voice: Voice;
  onMessages: () => void;
  onPlan: () => void;
}) {
  const c = useCompanion();
  const [now, setNow] = useState(new Date());
  const [demoNotice, setDemoNotice] = useState(false);
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
      <GardenHome active={voice.active} onPlan={onPlan}>
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
                {ended ? "Talk a little more" : "Let’s talk"}
              </Text>
            </Pressable>
            <Text style={styles.anytime}>
              Ready whenever you are. Talk anytime.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onMessages}
              style={styles.typeLink}
            >
              <MessageCircle size={17} color={colors.muted} />
              <Text style={styles.typeText}>Type instead</Text>
            </Pressable>
          </>
        )}
      </GardenHome>
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
            Voice needs microphone access in a supported browser or the latest
            mobile build.
          </Text>
        )}
        {demoNotice && (
          <Text style={styles.demo}>
            This is a sample space. Sign in to have a real voice
            conversation—your microphone hasn’t been opened.
          </Text>
        )}
      </View>
      {voice.pendingPlan && (
        <View style={styles.proposal}>
          <Text style={s.eyebrow}>Does this feel right?</Text>
          <Text style={styles.proposalText}>{voice.pendingPlan.summary}</Text>
          <Text style={styles.anytime}>Say “yes, save that” or tap below.</Text>
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
            <Text style={styles.typeText}>Not quite—let’s change it</Text>
          </Pressable>
        </View>
      )}
      {!voice.active && (
        <View style={styles.bottom}>
          {next ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit my check-in plan"
              onPress={onPlan}
              style={styles.checkin}
            >
              <View style={styles.clock}>
                <Clock3 size={20} strokeWidth={1.5} color={colors.green} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={styles.checkinLabel}>OUR NEXT CHECK-IN</Text>
                <Text style={styles.checkinTime}>
                  {next.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    timeZone: p.timezone,
                  })}{" "}
                  · {formatCheckinTime(p.checkin_time)}
                </Text>
                <Text style={styles.checkinNote}>
                  Open Kindred when you’re free.
                </Text>
              </View>
              <ArrowUpRight size={19} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onPlan}
              style={styles.checkin}
            >
              <Clock3 size={21} color={colors.green} />
              <Text style={[styles.checkinTime, { flex: 1 }]}>
                Choose a little time for yourself
              </Text>
              <ArrowUpRight size={19} color={colors.muted} />
            </Pressable>
          )}
          <Text style={styles.disclosure}>
            An AI voice, a space to be yourself. Conversations are transcribed
            so Kindred can remember where you left off.
          </Text>
        </View>
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
    paddingBottom: 24,
  },
  talkButton: {
    backgroundColor: colors.green,
    borderRadius: 30,
    minHeight: 58,
    paddingVertical: 17,
    paddingHorizontal: 35,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    minWidth: 226,
  },
  talkText: { fontSize: 18, color: "#fff", fontWeight: "600" },
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
  typeText: { fontSize: 14, color: colors.muted },
  bottom: { width: "100%", gap: 16, marginTop: 24 },
  checkin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: "#FFFEFB",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  clock: { backgroundColor: "#EDF1E7", padding: 10, borderRadius: 14 },
  checkinLabel: {
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "600",
    color: colors.muted,
  },
  checkinTime: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: "600",
    lineHeight: 21,
  },
  checkinNote: { fontSize: 12, color: colors.muted },
  disclosure: {
    fontSize: 11,
    lineHeight: 18,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 20,
    marginTop: 9,
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
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
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
    minHeight: 54,
    backgroundColor: "#8F5147",
    borderRadius: 27,
    paddingHorizontal: 23,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  endText: { fontSize: 15, fontWeight: "600", color: "white" },
  error: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    color: colors.danger,
    marginTop: 14,
    maxWidth: 360,
  },
  demo: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.muted,
    textAlign: "center",
    marginTop: 14,
    maxWidth: 360,
  },
  proposal: {
    width: "100%",
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.sage,
    gap: 12,
    marginTop: 20,
  },
  proposalText: { fontSize: 16, lineHeight: 25, color: colors.ink },
});
