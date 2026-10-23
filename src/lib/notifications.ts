import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";
export async function registerPush() {
  if (Platform.OS === "web")
    throw new Error(
      "Push reminders need an iOS or Android development build on a physical device.",
    );
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId)
    throw new Error(
      "Set the EAS project ID and configure APNs / FCM before enabling device push.",
    );
  const Notifications = await import("expo-notifications");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("gentle-reminders", {
      name: "Gentle reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Notifications are off. You can enable them later in your phone settings.",
    );
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase!.rpc("register_device", { p_token: token });
  if (error) throw error;
  await AsyncStorage.setItem("kindred-device-token", token);
}
