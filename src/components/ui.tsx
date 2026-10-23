import React from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
  ActivityIndicator,
  type TextInputProps,
} from "react-native";
export const colors = {
  background: "#F8F5EF",
  card: "#FFFEFB",
  ink: "#243E36",
  muted: "#5F7066",
  green: "#355F50",
  sage: "#DFE9DD",
  peach: "#F2D4BB",
  line: "#E4E6DA",
  danger: "#9A423B",
};
export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={s.heading}>
      {children}
    </Text>
  );
}
export function Body({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <Text style={[s.body, muted && { color: colors.muted }]}>{children}</Text>
  );
}
export function Card({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <View style={[s.card, accent && { backgroundColor: colors.sage }]}>
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  label,
}: {
  label?: string;
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.green : "white"} />
      ) : (
        <Text style={[s.buttonText, secondary && { color: colors.green }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <Text style={s.title}>{title}</Text>
      <Body muted>{text}</Body>
    </Card>
  );
}
export const s = StyleSheet.create({
  heading: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  title: { fontSize: 19, fontWeight: "600", color: colors.ink, lineHeight: 27 },
  body: { fontSize: 16, lineHeight: 25, color: colors.ink },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.4,
  },
  card: {
    padding: 21,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 13,
  },
  button: {
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: colors.sage },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  stack: { gap: 18 },
  small: { fontSize: 13, lineHeight: 20, color: colors.muted },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.sage,
  },
  page: { padding: 22, gap: 22, paddingBottom: 32 },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
