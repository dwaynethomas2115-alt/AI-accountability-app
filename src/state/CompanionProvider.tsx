import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { randomUUID } from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  emptySnapshot,
  localDate,
  type Snapshot,
  type Goal,
  type Profile,
  type EventDraft,
  type Message,
} from "../lib/types";
const uid = randomUUID;
type Actions = {
  data: Snapshot;
  loading: boolean;
  busy: boolean;
  demo: boolean;
  session: Session | null;
  error: string;
  clearError: () => void;
  enterDemo: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  send: (text: string) => Promise<void>;
  addGoal: (
    g: Pick<Goal, "title" | "steps" | "schedule">,
    source?: string,
  ) => Promise<void>;
  editGoal: (
    id: string,
    patch: Partial<Pick<Goal, "title" | "steps" | "schedule" | "status">>,
  ) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  toggleCompletion: (id: string) => Promise<void>;
  saveEvent: (e: EventDraft, source?: string) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  saveMemory: (content: string, id?: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
};
const Context = createContext<Actions | null>(null);
export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scope = useRef(0);
  const lock = useRef(false);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      scope.current++;
      setSession(s);
      if (!s) setData(emptySnapshot());
    });
    const sub = AppState.addEventListener("change", (state) =>
      state === "active"
        ? supabase!.auth.startAutoRefresh()
        : supabase!.auth.stopAutoRefresh(),
    );
    return () => {
      listener.subscription.unsubscribe();
      sub.remove();
    };
  }, []);
  async function refresh() {
    if (demo || !session || !supabase) return;
    const version = scope.current;
    const tables = [
      "profiles",
      "goals",
      "completions",
      "events",
      "memories",
      "messages",
    ];
    const results = await Promise.all(
      tables.map((t) =>
        supabase!
          .from(t)
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: t !== "messages" })
          .limit(t === "messages" ? 100 : 1000),
      ),
    );
    for (const r of results) if (r.error) throw r.error;
    if (version !== scope.current) return;
    const profile = results[0]!.data?.[0];
    setData({
      profile: profile
        ? { ...emptySnapshot().profile, ...profile }
        : emptySnapshot().profile,
      goals: results[1]!.data ?? [],
      completions: results[2]!.data ?? [],
      events: results[3]!.data ?? [],
      memories: results[4]!.data ?? [],
      messages: (results[5]!.data ?? []).reverse(),
    } as Snapshot);
  }
  useEffect(() => {
    if (session && !demo) {
      setLoading(true);
      refresh()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [session?.user.id, demo]);
  useEffect(() => {
    if (demo && !loading)
      AsyncStorage.setItem("kindred-demo", JSON.stringify(data)).catch(() =>
        setError("Could not save the local demo."),
      );
  }, [data, demo, loading]);
  async function run(fn: () => Promise<void>) {
    if (lock.current)
      throw new Error("Please wait for the current action to finish.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ??
            "Something went wrong. Please try again.");
      setError(message);
      throw new Error(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function write(
    table: string,
    op: "insert" | "update" | "delete" | "upsert",
    value: object,
    id?: string,
  ) {
    if (!supabase || !session) throw new Error("Please sign in first.");
    let query;
    if (op === "insert")
      query = supabase
        .from(table)
        .insert({ ...value, user_id: session.user.id });
    else if (op === "upsert")
      query = supabase
        .from(table)
        .upsert({ ...value, user_id: session.user.id });
    else if (op === "update")
      query = supabase
        .from(table)
        .update(value)
        .eq("id", id!)
        .eq("user_id", session.user.id);
    else
      query = supabase
        .from(table)
        .delete()
        .eq("id", id!)
        .eq("user_id", session.user.id);
    const { error } = await query;
    if (error) throw error;
    await refresh();
  }
  const actions: Actions = {
    data,
    loading,
    busy,
    demo,
    session,
    error,
    clearError: () => setError(""),
    enterDemo: () => {
      setLoading(true);
      scope.current++;
      AsyncStorage.getItem("kindred-demo")
        .then((raw) => {
          setData(raw ? JSON.parse(raw) : emptySnapshot());
          setDemo(true);
        })
        .catch(() => {
          setData(emptySnapshot());
          setDemo(true);
        })
        .finally(() => setLoading(false));
    },
    signOut: async () => {
      scope.current++;
      if (!demo) {
        const token = await AsyncStorage.getItem("kindred-device-token");
        if (token && session) {
          const { error } = await supabase!
            .from("devices")
            .delete()
            .eq("user_id", session.user.id)
            .eq("token", token);
          if (error) throw error;
          await AsyncStorage.removeItem("kindred-device-token");
        }
        await supabase?.auth.signOut();
      }
      setDemo(false);
      setData(emptySnapshot());
    },
    refresh,
    saveProfile: (p) =>
      run(async () => {
        if (demo) setData((d) => ({ ...d, profile: p }));
        else await write("profiles", "upsert", p);
      }),
    addGoal: (g, source) =>
      run(async () => {
        if (!g.title.trim()) throw new Error("Give your goal a name.");
        if (demo)
          setData((d) => ({
            ...d,
            goals: [
              ...d.goals,
              {
                ...g,
                id: uid(),
                user_id: "demo",
                status: "active",
                created_at: new Date().toISOString(),
              },
            ],
          }));
        else
          await write("goals", "insert", {
            ...g,
            source_message_id: source ?? null,
          });
      }),
    editGoal: (id, patch) =>
      run(async () => {
        if (demo)
          setData((d) => ({
            ...d,
            goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          }));
        else await write("goals", "update", patch, id);
      }),
    deleteGoal: (id) =>
      run(async () => {
        if (demo)
          setData((d) => ({
            ...d,
            goals: d.goals.filter((g) => g.id !== id),
            completions: d.completions.filter((c) => c.goal_id !== id),
          }));
        else await write("goals", "delete", {}, id);
      }),
    toggleCompletion: (id) =>
      run(async () => {
        const date = localDate(new Date(), data.profile.timezone);
        const done = data.completions.find(
          (c) => c.goal_id === id && c.local_date === date,
        );
        if (demo)
          setData((d) => ({
            ...d,
            completions: done
              ? d.completions.filter((c) => c.id !== done.id)
              : [
                  ...d.completions,
                  { id: uid(), goal_id: id, local_date: date },
                ],
          }));
        else if (done) await write("completions", "delete", {}, done.id);
        else
          await write("completions", "insert", {
            goal_id: id,
            local_date: date,
          });
      }),
    saveEvent: (event, source) =>
      run(async () => {
        if (
          !event.title.trim() ||
          !Number.isFinite(Date.parse(event.starts_at)) ||
          Date.parse(event.starts_at) <= Date.now()
        )
          throw new Error("Choose a title and a future date and time.");
        if (demo)
          setData((d) => ({
            ...d,
            events: [
              ...d.events,
              { ...event, id: uid(), created_at: new Date().toISOString() },
            ],
          }));
        else
          await write("events", "insert", {
            ...event,
            source_message_id: source ?? null,
          });
      }),
    deleteEvent: (id) =>
      run(async () => {
        if (demo)
          setData((d) => ({
            ...d,
            events: d.events.filter((e) => e.id !== id),
          }));
        else await write("events", "delete", {}, id);
      }),
    saveMemory: (content, id) =>
      run(async () => {
        if (!content.trim())
          throw new Error("Write something you want me to remember.");
        if (demo)
          setData((d) => ({
            ...d,
            memories: id
              ? d.memories.map((m) => (m.id === id ? { ...m, content } : m))
              : [
                  ...d.memories,
                  { id: uid(), content, created_at: new Date().toISOString() },
                ],
          }));
        else await write("memories", id ? "update" : "insert", { content }, id);
      }),
    deleteMemory: (id) =>
      run(async () => {
        if (demo)
          setData((d) => ({
            ...d,
            memories: d.memories.filter((m) => m.id !== id),
          }));
        else await write("memories", "delete", {}, id);
      }),
    clearHistory: () =>
      run(async () => {
        if (demo) setData((d) => ({ ...d, messages: [] }));
        else {
          const { error } = await supabase!
            .from("messages")
            .delete()
            .eq("user_id", session!.user.id);
          if (error) throw error;
          await refresh();
        }
      }),
    send: (text) =>
      run(async () => {
        if (!text.trim()) return;
        if (demo) {
          const now = new Date().toISOString();
          const proposal = { goal: null, event: null, memory: null };
          const user: Message = {
            id: uid(),
            role: "user",
            content: text,
            created_at: now,
            proposal: null,
          };
          const reply: Message = {
            id: uid(),
            role: "assistant",
            content:
              "This is the local demo, so I cannot understand or remember this conversation with AI yet. You can try a sample goal below, edit it, and save it to explore the flow. Connect Supabase and OpenAI to have a real conversation.",
            created_at: now,
            proposal: {
              ...proposal,
              goal: {
                title: "Make time for a short walk",
                steps: [
                  "Put your shoes by the door",
                  "Walk for 10 minutes at a comfortable pace",
                ],
                schedule: { kind: "daily", days: [] },
              },
              event: {
                title: "A little time outside",
                starts_at: new Date(Date.now() + 86400000).toISOString(),
                timezone: data.profile.timezone,
                duration_minutes: 20,
                reminder_minutes: 30,
                post_checkin: false,
              },
            },
          };
          setData((d) => ({ ...d, messages: [...d.messages, user, reply] }));
          return;
        }
        const { error } = await supabase!.functions.invoke("chat", {
          body: { text, request_id: uid() },
        });
        if (error)
          throw new Error(
            "The companion could not respond. Check your connection and backend setup, then try again.",
          );
        await refresh();
      }),
  };
  return <Context.Provider value={actions}>{children}</Context.Provider>;
}
export function useCompanion() {
  const c = useContext(Context);
  if (!c) throw new Error("Missing CompanionProvider");
  return c;
}
