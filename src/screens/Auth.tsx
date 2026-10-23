import React, { useState } from "react";
import { View, Text } from "react-native";
import {
  Button,
  Field,
  Body,
  Card,
  Heading,
  s,
  colors,
} from "../components/ui";
import { useCompanion } from "../state/CompanionProvider";
import { supabase } from "../lib/supabase";
export function Auth() {
  const c = useCompanion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit() {
    setBusy(true);
    setNotice("");
    try {
      const result = signup
        ? await supabase!.auth.signUp({ email: email.trim(), password })
        : await supabase!.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setNotice(
          "Check your email to confirm your account, then return here to sign in.",
        );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.stack}>
      <Text style={{ fontSize: 54, color: colors.green }}>✳</Text>
      <Text style={s.eyebrow}>Meet Kindred</Text>
      <Heading>{"A little support.\nA little more you."}</Heading>
      <Body muted>
        A caring space for your goals, your plans, and the days that don’t go to
        plan.
      </Body>
      <Card>
        <Text style={s.title}>
          {signup ? "Make yourself at home" : "Welcome back"}
        </Text>
        {supabase ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={signup ? "new-password" : "current-password"}
            />
            <Button
              title={signup ? "Create account" : "Sign in"}
              busy={busy}
              disabled={!email.trim() || password.length < 8}
              onPress={() => void submit()}
            />
            <Button
              title={
                signup
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"
              }
              secondary
              onPress={() => setSignup(!signup)}
            />
          </>
        ) : (
          <Body muted>
            The cloud backend isn’t connected yet. Try the local demo below, or
            follow the setup guide to connect your own Supabase project.
          </Body>
        )}
        {notice && (
          <Text accessibilityRole="alert" style={s.body}>
            {notice}
          </Text>
        )}
      </Card>
      <Button title="Explore the local demo" secondary onPress={c.enterDemo} />
      <Body muted>Small steps count. You’re welcome just as you are.</Body>
    </View>
  );
}
export function Onboarding() {
  const c = useCompanion();
  const [name, setName] = useState(c.data.profile.display_name);
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>At your pace</Text>
      <Heading>You don’t have to do it all today.</Heading>
      <Body>
        Let’s start with one small promise to yourself. I’ll help you find a
        pace that fits your life.
      </Body>
      <Card>
        <Field
          label="What should I call you?"
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
        <Body muted>
          You control what’s remembered. Notifications stay off until you choose
          to enable them. You can pause any goal, anytime.
        </Body>
        <Body muted>
          Kindred uses AI and can make mistakes. It is not a substitute for
          professional or emergency support. In connected mode, recent chat and
          approved memories are sent to OpenAI to generate replies.
        </Body>
        <Button
          title="Let’s begin"
          disabled={!name.trim()}
          busy={c.busy}
          onPress={() =>
            c
              .saveProfile({
                ...c.data.profile,
                display_name: name.trim(),
                onboarded: true,
              })
              .catch(() => {})
          }
        />
      </Card>
    </View>
  );
}
