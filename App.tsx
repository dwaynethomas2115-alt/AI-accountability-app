import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, SlidersHorizontal, Sprout, X } from "lucide-react-native";
import { CompanionProvider, useCompanion } from "./src/state/CompanionProvider";
import { useVoiceConversation } from "./src/hooks/useVoiceConversation";
import { Auth } from "./src/screens/Auth";
import { PlanScreen } from "./src/screens/Plan";
import { TalkScreen } from "./src/screens/Talk";
import { PrivacyScreen } from "./src/screens/Privacy";
import { Chat } from "./src/screens/Chat";
import { Calendar } from "./src/screens/Calendar";
import { colors } from "./src/components/ui";
type Screen = "home" | "talk" | "plan" | "messages" | "privacy" | "calendar";
function Shell() {
  const c = useCompanion();
  const [screen, setScreen] = useState<Screen>("home");
  const signed = c.demo || !!c.session;
  const voice = useVoiceConversation({
    enabled: !!c.session && !c.demo,
    accountId: c.session?.user.id ?? null,
    onPlanConfirmed: async (plan) => {
      await c.savePlan({ ...plan, timezone: c.data.profile.timezone });
    },
    onFinished: () => {
      void c.refresh().catch(() => {});
    },
  });
  const current =
    screen === "home" ? (c.data.profile.onboarded ? "talk" : "plan") : screen;
  const isTalk = current === "talk";
  function navigate(next: Screen) {
    if (voice.active) void voice.end();
    c.clearError();
    setScreen(next);
  }
  useEffect(() => {
    setScreen("home");
  }, [c.session?.user.id, c.demo]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    let remove: (() => void) | undefined;
    import("expo-notifications")
      .then(async (n) => {
        if (!active) return;
        n.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        const route = (
          r: import("expo-notifications").NotificationResponse | null,
        ) => {
          if (r?.notification.request.content.data?.screen === "Chat")
            setScreen("talk");
        };
        const sub = n.addNotificationResponseReceivedListener(route);
        remove = () => sub.remove();
        route(await n.getLastNotificationResponseAsync());
      })
      .catch(() => {});
    return () => {
      active = false;
      remove?.();
    };
  }, []);
  const content = !signed ? (
    <Auth />
  ) : current === "plan" ? (
    <PlanScreen
      onDone={() => navigate("talk")}
      onTalk={() => navigate("talk")}
      onPrivacy={() => navigate("privacy")}
    />
  ) : current === "privacy" ? (
    <PrivacyScreen
      onCalendar={() => navigate("calendar")}
      onSignOut={async () => {
        await voice.end();
        await c.signOut();
      }}
    />
  ) : current === "calendar" ? (
    <Calendar />
  ) : (
    <TalkScreen
      voice={voice}
      onMessages={() => navigate("messages")}
      onPlan={() => navigate("plan")}
    />
  );
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerInner}>
            {signed && !isTalk && screen !== "home" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to talking"
                onPress={() => navigate("talk")}
                style={styles.iconButton}
              >
                <ArrowLeft size={22} color={colors.green} />
              </Pressable>
            ) : (
              <View style={styles.brandMark}>
                <Sprout size={26} strokeWidth={1.65} color={colors.green} />
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kindred home"
              onPress={() => signed && navigate("talk")}
              style={styles.brand}
            >
              <Text style={styles.brandText}>kindred</Text>
              {c.demo && <Text style={styles.demo}>DEMO</Text>}
            </Pressable>
            {signed && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isTalk ? "My plan" : "Memory and account"}
                onPress={() => navigate(isTalk ? "plan" : "privacy")}
                style={styles.iconButton}
              >
                <SlidersHorizontal
                  size={21}
                  strokeWidth={1.6}
                  color={colors.green}
                />
              </Pressable>
            )}
          </View>
        </View>
        {c.error && (
          <View style={styles.error}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              {c.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
              onPress={c.clearError}
              style={styles.iconButton}
            >
              <X size={18} color={colors.danger} />
            </Pressable>
          </View>
        )}
        {c.loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading your space"
            style={styles.fill}
            size="large"
            color={colors.green}
          />
        ) : signed && current === "messages" ? (
          <Chat onTalk={() => navigate("talk")} />
        ) : (
          <ScrollView
            key={signed ? current : "auth"}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <View style={styles.column}>{content}</View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <CompanionProvider>
        <Shell />
      </CompanionProvider>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  header: {
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: "#E8E9DF",
    backgroundColor: colors.background,
  },
  headerInner: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  brandMark: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  brandText: {
    fontSize: 25,
    fontWeight: "600",
    color: colors.green,
    letterSpacing: -1.1,
  },
  demo: { fontSize: 9, color: colors.muted, letterSpacing: 1.1 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: "center",
    flexGrow: 1,
  },
  column: { width: "100%", maxWidth: 680 },
  error: {
    backgroundColor: "#F6E9DE",
    paddingLeft: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.danger,
    paddingVertical: 12,
  },
});
