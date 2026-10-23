import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState, Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { RealtimeVoiceSession } from "../lib/voice/session";
import { voicePlatform } from "../lib/voice/platform";
import { createVoiceApi } from "../lib/voice/api";
import type { VoicePlan } from "../lib/voice/types";

export type VoiceConversationOptions = {
  enabled: boolean;
  accountId: string | null;
  onPlanConfirmed: (plan: VoicePlan) => Promise<void>;
  onFinished?: () => void;
};
export function useVoiceConversation(options: VoiceConversationOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const startedBy = useRef<VoiceConversationOptions | null>(null);
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new RealtimeVoiceSession({
      platform: voicePlatform,
      api: createVoiceApi(() => startedBy.current?.accountId ?? null),
      id: randomUUID,
      onPlanConfirmed: async (plan) => {
        const owner = startedBy.current;
        if (
          !owner?.accountId ||
          !optionsRef.current.enabled ||
          owner.accountId !== optionsRef.current.accountId
        )
          throw new Error(
            "Your sign-in changed. Please start a new conversation.",
          );
        // Keep the initiating account's data action, including its scope guard.
        await owner.onPlanConfirmed(plan);
      },
      onFinished: () => {
        const owner = startedBy.current;
        if (owner?.accountId === optionsRef.current.accountId)
          owner?.onFinished?.();
      },
    });
  }
  const session = sessionRef.current;
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useLayoutEffect(() => {
    // A direct account switch does not necessarily pass through signed-out state.
    // Reset before paint so another account cannot see or confirm the old plan.
    session.reset();
    startedBy.current = null;
  }, [options.enabled, options.accountId, session]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") void session.end();
    });
    const hidden = () => {
      if (document.visibilityState === "hidden") void session.end();
    };
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.addEventListener("visibilitychange", hidden);
    return () => {
      subscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined")
        document.removeEventListener("visibilitychange", hidden);
      void session.end();
    };
  }, [session]);
  const start = useCallback(async () => {
    if (
      !optionsRef.current.enabled ||
      !optionsRef.current.accountId ||
      session.active
    )
      return;
    startedBy.current = { ...optionsRef.current };
    await session.start();
  }, [session]);
  const end = useCallback(() => session.end(), [session]);
  const toggleMute = useCallback(() => session.toggleMute(), [session]);
  const resumeAudio = useCallback(() => session.resumeAudio(), [session]);
  const confirmPlan = useCallback(() => session.confirmPlan(), [session]);
  const dismissPlan = useCallback(() => session.dismissPlan(), [session]);
  const clearError = useCallback(() => session.clearError(), [session]);
  return {
    ...snapshot,
    supported: session.supported,
    active: session.active,
    start,
    end,
    toggleMute,
    resumeAudio,
    confirmPlan,
    dismissPlan,
    clearError,
  };
}
export type VoiceConversation = ReturnType<typeof useVoiceConversation>;
