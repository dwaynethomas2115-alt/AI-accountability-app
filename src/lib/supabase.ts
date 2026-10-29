import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import {
  authFeedback,
  authRedirectUrl,
  callbackFeedback,
} from "./auth-feedback";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Capture recovery intent before the SDK consumes the email-link fragment.
const recoveryOwnerKey = "kindred-password-recovery-user";
function captureRecovery() {
  if (Platform.OS !== "web" || typeof window === "undefined")
    return {
      requested: false,
      owner: null as string | null,
      token: null as string | null,
    };
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const requested =
    hash.get("type") === "recovery" || query.get("reset") === "password";
  const callback =
    hash.has("access_token") ||
    hash.has("error") ||
    hash.has("error_code") ||
    query.has("error") ||
    query.has("error_code");
  let owner: string | null = null;
  try {
    if (requested && !callback)
      owner = window.sessionStorage.getItem(recoveryOwnerKey);
  } catch {
    /* A restricted browser may disallow session storage. */
  }
  return {
    requested,
    owner,
    token:
      requested &&
      !hash.has("error") &&
      !hash.has("error_code") &&
      hash.get("refresh_token")
        ? hash.get("access_token")
        : null,
  };
}
export const initialPasswordRecovery = captureRecovery();

/** Only a session actually accepted by the SDK may unlock a recovery form. */
export function matchesInitialRecoverySession(session: Session | null) {
  return (
    !!session &&
    !!initialPasswordRecovery.token &&
    session.access_token === initialPasswordRecovery.token
  );
}

export function rememberPasswordRecovery(owner: string | null) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    if (owner) window.sessionStorage.setItem(recoveryOwnerKey, owner);
    else window.sessionStorage.removeItem(recoveryOwnerKey);
  } catch {
    /* Reloading may require a fresh link when storage is blocked. */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("reset", "password");
    window.history.replaceState(window.history.state, "", url.href);
  } catch {
    /* A restricted browser may disallow URL cleanup. */
  }
}

export function clearRecoveryCallback() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    for (const key of [
      "access_token",
      "refresh_token",
      "token_type",
      "expires_in",
      "expires_at",
      "type",
      "error",
      "error_code",
      "error_description",
      "provider_token",
      "provider_refresh_token",
      "sb",
    ]) {
      hash.delete(key);
      url.searchParams.delete(key);
    }
    url.hash = hash.toString();
    window.history.replaceState(window.history.state, "", url.href);
  } catch {
    /* A restricted browser may disallow URL cleanup. */
  }
}

export function clearPasswordRecovery() {
  initialPasswordRecovery.token = null;
  initialPasswordRecovery.owner = null;
  initialAuthFeedback = null;
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  clearRecoveryCallback();
  try {
    window.sessionStorage.removeItem(recoveryOwnerKey);
  } catch {
    /* Storage may be blocked. */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    window.history.replaceState(window.history.state, "", url.href);
  } catch {
    /* A restricted browser may disallow URL cleanup. */
  }
}

// Capture link errors before Supabase consumes the auth fragment during startup.
export let initialAuthFeedback = callbackFeedback(
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.href
    : undefined,
);
export function clearInitialAuthFeedback() {
  initialAuthFeedback = null;
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!callbackFeedback(url.href)) return;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    for (const key of ["error", "error_code", "error_description", "sb"]) {
      hash.delete(key);
      url.searchParams.delete(key);
    }
    url.hash = hash.toString();
    window.history.replaceState(window.history.state, "", url.href);
  } catch {
    /* A restricted browser may disallow URL cleanup. */
  }
}
export const getAuthRedirectUrl = () =>
  authRedirectUrl(
    Platform.OS,
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.href
      : undefined,
  );

// Browser sessions persist across visits. Native refresh tokens stay in the OS store.
// Fall back to memory when a browser blocks storage, without breaking sign-in entirely.
const memory = new Map<string, string>();
const storage = {
  getItem: async (key: string) => {
    if (Platform.OS !== "web") return SecureStore.getItemAsync(key);
    const current = memory.get(key);
    if (current !== undefined) return current;
    try {
      const persistent = window.localStorage.getItem(key);
      if (persistent !== null) return persistent;
      // Preserve sessions created by the previous sessionStorage-based release.
      const previous = window.sessionStorage.getItem(key);
      if (previous !== null) {
        window.localStorage.setItem(key, previous);
        window.sessionStorage.removeItem(key);
        return previous;
      }
    } catch {
      /* Private browsing may reject storage. */
    }
    return memory.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
      // Keep memory only as a fallback, so another tab's refreshed session is visible.
      memory.delete(key);
    } catch {
      /* Use the in-memory session. */
    }
  },
  removeItem: async (key: string) => {
    if (Platform.OS !== "web") {
      await SecureStore.deleteItemAsync(key);
      return;
    }
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Storage is unavailable. */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* Remove legacy session when possible. */
    }
  },
};

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage,
          autoRefreshToken: true,
          persistSession: true,
          // Confirmation emails may be opened in a new tab or browser. Consume the session there.
          detectSessionInUrl: Platform.OS === "web",
          flowType: "implicit",
        },
      })
    : null;

/** Called by the auth provider; every listener is cleaned up when it unmounts. */
export function startNativeAuthListener(
  onError: (message: string) => void,
  onRecovery?: (session: Session | null, pending: boolean) => void,
) {
  if (Platform.OS === "web" || !supabase) return () => {};
  let active = true;
  let requestVersion = 0;
  async function handle(href: string | null | undefined) {
    if (!href || !active) return;
    let recovering = false;
    let version = requestVersion;
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== "kindred:" || parsed.hostname !== "auth") return;
      version = ++requestVersion;
      const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      recovering =
        params.get("type") === "recovery" ||
        parsed.searchParams.get("reset") === "password";
      if (recovering) onRecovery?.(null, true);
      const failure = callbackFeedback(href);
      if (failure) {
        onError(failure.message);
        if (recovering) onRecovery?.(null, false);
        return;
      }
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) {
        if (recovering) onRecovery?.(null, false);
        return;
      }
      const { data, error } = await supabase!.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error && active && version === requestVersion)
        onError(authFeedback(error).message);
      if (recovering && active && version === requestVersion)
        onRecovery?.(error ? null : data.session, false);
    } catch (error) {
      if (active && version === requestVersion) {
        onError(authFeedback(error).message);
        if (recovering) onRecovery?.(null, false);
      }
    }
  }
  void Linking.getInitialURL()
    .then(handle)
    .catch((error) => {
      if (active) onError(authFeedback(error).message);
    });
  const subscription = Linking.addEventListener("url", (event) => {
    void handle(event.url);
  });
  return () => {
    active = false;
    subscription.remove();
  };
}
