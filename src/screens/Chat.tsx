import React, { useState } from "react";
import { View, Text } from "react-native";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  s,
  colors,
} from "../components/ui";
import { GoalEditor, EventEditor } from "../components/Editors";
import { useCompanion } from "../state/CompanionProvider";
export function Chat() {
  const c = useCompanion();
  const [text, setText] = useState("");
  const [remembered, setRemembered] = useState<string[]>([]);
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>A moment together</Text>
      <Heading>What’s on your mind?</Heading>
      <Body muted>
        Big dreams, small wins, or a day that felt hard. There’s space for all
        of it.
      </Body>
      {c.demo && (
        <Card>
          <Body>
            Local demo · replies and proposal cards are labeled samples, not
            live AI.
          </Body>
        </Card>
      )}
      {!c.data.messages.length && (
        <Card accent>
          <Body>
            Hi, {c.data.profile.display_name}. What’s one thing you’d love to
            make a little more room for?
          </Body>
          <Button
            title="I want to make time for a walk"
            secondary
            onPress={() =>
              setText("I want to make time for a short walk every day.")
            }
          />
        </Card>
      )}
      {c.data.messages.map((m) => (
        <View
          key={m.id}
          style={{
            gap: 12,
            marginLeft: m.role === "user" ? 30 : 0,
            marginRight: m.role === "assistant" ? 12 : 0,
          }}
        >
          <View
            style={[
              s.card,
              {
                backgroundColor: m.role === "user" ? colors.sage : colors.card,
              },
            ]}
          >
            <Text style={s.eyebrow}>
              {m.role === "user"
                ? "You"
                : c.demo
                  ? "Kindred · sample reply"
                  : "Kindred"}
            </Text>
            <Body>{m.content}</Body>
          </View>
          {m.proposal?.goal && (
            <Card>
              <Text style={s.title}>
                {c.demo ? "Sample goal" : "A small plan for you"}
              </Text>
              <GoalEditor
                initial={m.proposal.goal}
                busy={c.busy}
                onSave={(g) => c.addGoal(g, m.id)}
              />
            </Card>
          )}
          {m.proposal?.event && (
            <Card>
              <EventEditor
                draft={m.proposal.event}
                busy={c.busy}
                onSave={(e) => c.saveEvent(e, m.id)}
              />
            </Card>
          )}
          {m.proposal?.memory && (
            <Card>
              <Text style={s.title}>Would you like me to remember this?</Text>
              <Body>{m.proposal.memory}</Body>
              <Button
                title={
                  remembered.includes(m.id) ? "Remembered" : "Save this memory"
                }
                disabled={remembered.includes(m.id) || c.busy}
                secondary
                onPress={() =>
                  c
                    .saveMemory(m.proposal!.memory!)
                    .then(() => setRemembered((v) => [...v, m.id]))
                    .catch(() => {})
                }
              />
            </Card>
          )}
        </View>
      ))}
      {c.busy && <Body muted>Taking a moment…</Body>}
      <Card>
        <Field
          label="Message Kindred"
          placeholder="I’d like to…"
          multiline
          value={text}
          onChangeText={setText}
          maxLength={4000}
        />
        <Button
          title="Send message"
          busy={c.busy}
          disabled={!text.trim()}
          onPress={() => {
            const value = text;
            c.send(value)
              .then(() => setText(""))
              .catch(() => {});
          }}
        />
        <Body muted>
          AI can make mistakes. Goals, calendar events, and memories are only
          saved when you confirm them.
        </Body>
      </Card>
      <Body muted>Voice conversations are planned for the next milestone.</Body>
    </View>
  );
}
