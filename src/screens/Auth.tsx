import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Body,
  Button,
  Card,
  colors,
  Field,
  Heading,
  s,
} from "../components/ui";
import { useCompanion } from "../state/CompanionProvider";
import {
  authFeedback,
  RESEND_COOLDOWN_SECONDS,
  resendSecondsRemaining,
  type AuthFeedback,
} from "../lib/auth-feedback";
import {
  clearInitialAuthFeedback,
  getAuthRedirectUrl,
  initialAuthFeedback,
  supabase,
} from "../lib/supabase";

type Mode = "signin" | "signup" | "confirm";

export function Auth() {
  const c = useCompanion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>(
    initialAuthFeedback?.needsConfirmation ? "confirm" : "signin",
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(
    initialAuthFeedback,
  );
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const locked = useRef(false);
  const remaining = resendSecondsRemaining(resendAt, now);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    clearInitialAuthFeedback();
  }, []);
  useEffect(() => {
    if (!resendAt) return;
    const interval = setInterval(() => {
      const clock = Date.now();
      setNow(clock);
      if (clock >= resendAt) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendAt]);

  function cooldown() {
    const clock = Date.now();
    setNow(clock);
    setResendAt(clock + RESEND_COOLDOWN_SECONDS * 1000);
  }
  function changeMode(next: Mode) {
    setMode(next);
    setFeedback(null);
  }
  async function submit() {
    if (
      locked.current ||
      !supabase ||
      !validEmail ||
      password.length < (mode === "signup" ? 8 : 1) ||
      (mode === "signup" && remaining > 0)
    )
      return;
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      if (mode === "signup") {
        const redirect = getAuthRedirectUrl();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: redirect ? { emailRedirectTo: redirect } : undefined,
        });
        if (error) throw error;
        if (!data.session) {
          cooldown();
          setMode("confirm");
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      const explanation = authFeedback(error);
      setFeedback(explanation);
      if (explanation.needsConfirmation) setMode("confirm");
      if (explanation.rateLimited) cooldown();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function resend() {
    if (locked.current || !supabase || !validEmail || remaining > 0) return;
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    cooldown();
    try {
      const redirect = getAuthRedirectUrl();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: redirect ? { emailRedirectTo: redirect } : undefined,
      });
      if (error) throw error;
      setFeedback({
        kind: "info",
        message:
          "Confirmation requested. Check your inbox and spam folder, and use the newest email link. If this account is already confirmed, simply sign in.",
      });
    } catch (error) {
      setFeedback(authFeedback(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.intro}>
        <Text style={s.eyebrow}>A little support, every day</Text>
        <Heading>
          {mode === "confirm"
            ? "Check your email."
            : "A friend for your\nsmall promises."}
        </Heading>
        <Body muted>
          {mode === "confirm"
            ? "One quick confirmation, then we can talk."
            : "Talk things through. Find your next small step. Come back whenever you need."}
        </Body>
      </View>
      <Card>
        {!supabase ? (
          <Body muted>
            Your companion is still being connected. You can explore the local
            demo for now.
          </Body>
        ) : mode === "confirm" ? (
          <>
            <View style={styles.notice}>
              <Text style={s.title}>Confirm your email to continue</Text>
              <Body>
                {email.trim()
                  ? `Open the confirmation email for ${email.trim()}, then follow its link to finish setting up your account.`
                  : "Enter the email you used to create your account, then request a fresh confirmation link."}
              </Body>
              <Body muted>
                The link opens Kindred. If you already used it successfully,
                sign in below.
              </Body>
            </View>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!busy}
            />
            {feedback && <Notice feedback={feedback} />}
            <Button
              title="Back to sign in"
              disabled={busy}
              onPress={() => changeMode("signin")}
            />
            <TextLink
              label={
                remaining
                  ? `Resend available in ${remaining}s`
                  : "Resend confirmation email"
              }
              disabled={busy || !validEmail || remaining > 0}
              onPress={() => {
                void resend();
              }}
            />
            <Text style={s.small}>
              Check your spam folder too. If emails are temporarily limited,
              waiting a minute may not be enough—the email service may need
              longer to reset.
            </Text>
          </>
        ) : (
          <>
            <Text style={s.title}>
              {mode === "signup" ? "Make yourself at home" : "Welcome back"}
            </Text>
            {feedback && <Notice feedback={feedback} />}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!busy}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (password.length >= (mode === "signup" ? 8 : 1))
                  void submit();
              }}
            />
            {mode === "signup" && (
              <Text style={s.small}>
                Use at least 8 characters. If email confirmation is required,
                we’ll send you a link before you can sign in.
              </Text>
            )}
            <Button
              title={mode === "signup" ? "Create account" : "Sign in"}
              busy={busy}
              disabled={
                !validEmail ||
                password.length < (mode === "signup" ? 8 : 1) ||
                (mode === "signup" && remaining > 0)
              }
              onPress={() => {
                void submit();
              }}
            />
            {mode === "signup" && remaining > 0 && (
              <Text style={s.small}>
                Please wait before requesting another email.
              </Text>
            )}
            <TextLink
              label={
                mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"
              }
              disabled={busy}
              onPress={() =>
                changeMode(mode === "signup" ? "signin" : "signup")
              }
            />
          </>
        )}
      </Card>
      {mode !== "confirm" && (
        <TextLink
          label="Explore the local demo"
          disabled={busy}
          onPress={c.enterDemo}
        />
      )}
    </View>
  );
}

function Notice({ feedback }: { feedback: AuthFeedback }) {
  return (
    <View style={[styles.feedback, feedback.kind === "error" && styles.error]}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[s.body, feedback.kind === "error" && { color: colors.danger }]}
      >
        {feedback.message}
      </Text>
    </View>
  );
}
function TextLink({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        (disabled || pressed) && { opacity: 0.5 },
      ]}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  page: { gap: 24, paddingVertical: 12 },
  intro: { gap: 14 },
  notice: {
    padding: 17,
    borderRadius: 18,
    backgroundColor: colors.sage,
    gap: 12,
  },
  feedback: { padding: 14, borderRadius: 14, backgroundColor: colors.sage },
  error: { backgroundColor: "#FAEAE2" },
  link: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.green,
    textAlign: "center",
  },
});
