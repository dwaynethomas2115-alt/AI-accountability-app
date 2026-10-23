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
import { CompanionProvider, useCompanion } from "./src/state/CompanionProvider";
import { Auth, Onboarding } from "./src/screens/Auth";
import { Dashboard } from "./src/screens/Dashboard";
import { Chat } from "./src/screens/Chat";
import { Calendar } from "./src/screens/Calendar";
import { Settings } from "./src/screens/Settings";
import { colors, s } from "./src/components/ui";
type Tab = "Today" | "Chat" | "Calendar" | "Your space";
function Shell() {
  const c = useCompanion();
  const [tab, setTab] = useState<Tab>("Today");
  const signed = c.demo || !!c.session;
  const onboarded = signed && c.data.profile.onboarded;
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
            setTab("Chat");
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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>✳ kindred</Text>
          <Text style={s.small}>
            {c.demo ? "LOCAL DEMO" : "A little support, every day"}
          </Text>
        </View>
        {c.error && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
            onPress={c.clearError}
            style={{ padding: 14, backgroundColor: "#F9E4DA" }}
          >
            <Text accessibilityRole="alert" style={{ color: colors.danger }}>
              {c.error} · Dismiss
            </Text>
          </Pressable>
        )}
        {c.loading ? (
          <ActivityIndicator
            style={{ flex: 1 }}
            size="large"
            color={colors.green}
          />
        ) : (
          <ScrollView
            key={onboarded ? tab : signed ? "onboarding" : "auth"}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <View style={styles.column}>
              {!signed ? (
                <Auth />
              ) : !onboarded ? (
                <Onboarding />
              ) : tab === "Today" ? (
                <Dashboard openChat={() => setTab("Chat")} />
              ) : tab === "Chat" ? (
                <Chat />
              ) : tab === "Calendar" ? (
                <Calendar />
              ) : (
                <Settings />
              )}
            </View>
          </ScrollView>
        )}
        {onboarded && (
          <View style={styles.nav}>
            {(["Today", "Chat", "Calendar", "Your space"] as Tab[]).map(
              (t, i) => (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  accessibilityLabel={t}
                  onPress={() => setTab(t)}
                  style={[
                    styles.tab,
                    tab === t && { backgroundColor: colors.sage },
                  ]}
                >
                  <Text style={{ fontSize: 21, color: colors.green }}>
                    {["◉", "✧", "▦", "☷"][i]}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.ink,
                      fontWeight: tab === t ? "700" : "400",
                    }}
                  >
                    {t}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
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
  header: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  brand: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.green,
    letterSpacing: -1,
  },
  content: { padding: 22, paddingBottom: 36, alignItems: "center" },
  column: { width: "100%", maxWidth: 720, gap: 20 },
  nav: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    gap: 5,
  },
  tab: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
});
