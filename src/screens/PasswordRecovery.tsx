import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  Body,
  Button,
  Card,
  colors,
  Field,
  Heading,
  s,
} from "../components/ui";
import {
  passwordResetFeedback,
  RESEND_COOLDOWN_SECONDS,
  resendSecondsRemaining,
} from "../lib/auth-feedback";
import { getAuthRedirectUrl, supabase } from "../lib/supabase";

const validEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

function ErrorNotice({ message }: { message: string }) {
  return (
    <View style={styles.error}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[s.body, { color: colors.danger }]}
      >
        {message}
      </Text>
    </View>
  );
}

export function ResetPasswordRequest({
  onBack,
  expired = false,
  initialEmail = "",
}: {
  onBack: () => void;
  expired?: boolean;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const locked = useRef(false);
  const remaining = resendSecondsRemaining(resendAt, now);
  useEffect(() => {
    if (!resendAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [resendAt]);
  function cooldown() {
    const clock = Date.now();
    setNow(clock);
    setResendAt(clock + RESEND_COOLDOWN_SECONDS * 1000);
  }
  async function send() {
    if (
      !supabase ||
      locked.current ||
      !validEmail(email) ||
      Date.now() < resendAt
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const redirect = getAuthRedirectUrl();
      if (!redirect) throw new Error("Missing password reset return URL");
      const destination = new URL(redirect);
      destination.searchParams.set("reset", "password");
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: destination.href },
      );
      if (error) throw error;
      cooldown();
      setSent(true);
    } catch (e) {
      const feedback = passwordResetFeedback(e);
      setError(feedback.message);
      if (feedback.rateLimited) cooldown();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={styles.page}>
      <View style={styles.intro}>
        <Heading>
          {sent ? "Check your email." : "Let’s get you back in."}
        </Heading>
        <Body muted>
          {sent
            ? "A fresh start, one email away."
            : "We’ll help you choose a new password."}
        </Body>
      </View>
      <Card>
        {sent ? (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Body>
              If an account exists for {email.trim()}, we’ve requested a
              password-reset email. Check your inbox and spam folder, and open
              the newest link to choose a new password.
            </Body>
          </View>
        ) : (
          <>
            <Body>
              {expired
                ? "This reset link is missing, expired, or already used. Request a fresh email below."
                : "Enter the email you use for Kindred. The reset link will bring you back here."}
            </Body>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!busy}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
            />
          </>
        )}
        {!!error && <ErrorNotice message={error} />}
        <Button
          title={
            remaining
              ? `Try again in ${remaining}s`
              : sent
                ? "Resend reset email"
                : "Send reset email"
          }
          busy={busy}
          disabled={!supabase || !validEmail(email) || remaining > 0}
          onPress={() => void send()}
        />
        {sent && (
          <Body muted>
            The email can take a few minutes to arrive. Use only the newest
            link.
          </Body>
        )}
        <Button
          title="Back to sign in"
          secondary
          disabled={busy}
          onPress={onBack}
        />
      </Card>
    </View>
  );
}

export function PasswordRecovery({
  validSession,
  onDone,
  onCancel,
}: {
  validSession: boolean;
  onDone: () => void;
  onCancel?: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (!validSession || expired)
    return <ResetPasswordRequest expired onBack={onDone} />;
  async function save() {
    if (
      !supabase ||
      locked.current ||
      password.length < 8 ||
      password !== confirmation ||
      !validSession
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (!mounted.current) return;
      setPassword("");
      setConfirmation("");
      setSaved(true);
    } catch (e) {
      if (!mounted.current) return;
      const feedback = passwordResetFeedback(e);
      setError(feedback.message);
      if (feedback.needsReset) setExpired(true);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function cancel() {
    if (locked.current || !onCancel) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await onCancel();
    } catch (e) {
      if (mounted.current) setError(passwordResetFeedback(e).message);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <View style={styles.page}>
      <Heading>
        {saved ? "Your password is updated." : "Choose a new password."}
      </Heading>
      <Card>
        {saved ? (
          <>
            <Body>
              You’re back in. Use your new password the next time you sign in.
            </Body>
            <Button title="Continue to Kindred" onPress={onDone} />
          </>
        ) : (
          <>
            <Body>Use at least 8 characters.</Body>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            <Field
              label="Confirm new password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
            />
            {!!confirmation && password !== confirmation && (
              <Body>Both passwords need to match.</Body>
            )}
            {!!error && <ErrorNotice message={error} />}
            <Button
              title="Save new password"
              busy={busy}
              disabled={password.length < 8 || password !== confirmation}
              onPress={() => void save()}
            />
            {onCancel && (
              <Button
                title="Back to sign in"
                secondary
                disabled={busy}
                onPress={() => void cancel()}
              />
            )}
          </>
        )}
      </Card>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { gap: 24, paddingVertical: 12 },
  intro: { gap: 14 },
  notice: { padding: 16, borderRadius: 16, backgroundColor: colors.sage },
  error: { padding: 14, borderRadius: 14, backgroundColor: "#FAEAE2" },
});
