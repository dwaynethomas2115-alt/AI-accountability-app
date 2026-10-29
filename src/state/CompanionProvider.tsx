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
import {
  supabase,
  startNativeAuthListener,
  initialPasswordRecovery,
  matchesInitialRecoverySession,
  rememberPasswordRecovery,
  clearRecoveryCallback,
  clearPasswordRecovery,
} from "../lib/supabase";
import {
  emptySnapshot,
  localDate,
  type Snapshot,
  type Goal,
  type Profile,
  type EventDraft,
  type Message,
} from "../lib/types";
import { normalizePlan, type Plan } from "../lib/plan";
import { gardenPlants } from "../lib/garden";
const uid = randomUUID;
function normalizeSnapshot(raw: Partial<Snapshot> | null): Snapshot {
  const empty = emptySnapshot();
  if (!raw || typeof raw !== "object") return empty;
  return {
    ...empty,
    ...raw,
    profile: { ...empty.profile, ...raw.profile },
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    completions: Array.isArray(raw.completions) ? raw.completions : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    memories: Array.isArray(raw.memories) ? raw.memories : [],
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    voiceSessions: Array.isArray(raw.voiceSessions) ? raw.voiceSessions : [],
  };
}
function missingTable(error: { code?: string } | null) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export type GardenWin = {
  id: string;
  goalId: string;
  title: string;
  before: number;
  after: number;
};

type Actions = {
  data: Snapshot;
  loading: boolean;
  authLoading: boolean;
  passwordRecovery: boolean;
  recoveryReady: boolean;
  finishPasswordRecovery: () => void;
  busy: boolean;
  demo: boolean;
  session: Session | null;
  error: string;
  latestGardenWin: GardenWin | null;
  dismissGardenWin: () => void;
  recordCompletion: (goalId: string) => Promise<void>;
  clearError: () => void;
  enterDemo: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  savePlan: (p: Plan) => Promise<void>;
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
  const dataRef = useRef(data);
  dataRef.current = data;
  const [latestGardenWin, setLatestGardenWin] = useState<GardenWin | null>(
    null,
  );
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(
    initialPasswordRecovery.requested,
  );
  const [recoveryOwner, setRecoveryOwner] = useState(
    initialPasswordRecovery.owner,
  );
  const [nativeRecoveryPending, setNativeRecoveryPending] = useState(false);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [dataLoading, setDataLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const loading = authLoading || dataLoading || demoLoading;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scope = useRef(0);
  const lock = useRef<symbol | null>(null);
  const refreshCount = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const demoRef = useRef(false);
  const recoveryOwnerRef = useRef(recoveryOwner);
  const recoveringRef = useRef(passwordRecovery);
  function finishPasswordRecovery() {
    recoveringRef.current = false;
    recoveryOwnerRef.current = null;
    setPasswordRecovery(false);
    setRecoveryOwner(null);
    setNativeRecoveryPending(false);
    clearPasswordRecovery();
    setError("");
  }
  function startPasswordRecovery(owner: string | null, pending = false) {
    recoveringRef.current = true;
    recoveryOwnerRef.current = owner;
    setPasswordRecovery(true);
    setRecoveryOwner(owner);
    setNativeRecoveryPending(pending);
    rememberPasswordRecovery(owner);
    if (demoRef.current) {
      demoRef.current = false;
      setDemo(false);
      setDemoLoading(false);
    }
  }
  // Actions retained by an open conversation must never move into another account.
  const actionScope = scope.current;
  function assertActiveScope() {
    if (
      actionScope !== scope.current ||
      demo !== demoRef.current ||
      session?.user.id !== sessionRef.current?.user.id
    )
      throw new Error("Your sign-in changed. Please try again.");
    if (!demo && (!supabase || !sessionRef.current))
      throw new Error("Please sign in first.");
    return sessionRef.current;
  }
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let authEventSeen = false;
    const acceptSession = (next: Session | null) => {
      if (!mounted) return;
      if (sessionRef.current?.user.id !== next?.user.id) {
        // An email callback should enter the signed-in account even from the demo.
        if (demoRef.current && next) {
          demoRef.current = false;
          setDemo(false);
          setDemoLoading(false);
        }
        if (!demoRef.current) {
          scope.current++;
          lock.current = null;
          setBusy(false);
          setData(emptySnapshot());
          setLatestGardenWin(null);
          setDataLoading(Boolean(next));
          setError("");
        }
      }
      sessionRef.current = next;
      setSession(next);
    };
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, next) => {
        authEventSeen = true;
        if (event === "PASSWORD_RECOVERY" && next) {
          startPasswordRecovery(next.user.id);
          clearRecoveryCallback();
        } else if (event === "SIGNED_OUT" && recoveringRef.current) {
          finishPasswordRecovery();
        } else if (matchesInitialRecoverySession(next)) {
          startPasswordRecovery(next!.user.id);
          clearRecoveryCallback();
        } else if (
          recoveryOwnerRef.current &&
          recoveryOwnerRef.current !== next?.user.id
        ) {
          startPasswordRecovery(null);
        }
        acceptSession(next);
      },
    );
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (authEventSeen) return;
        if (error) throw error;
        if (matchesInitialRecoverySession(data.session))
          startPasswordRecovery(data.session!.user.id);
        acceptSession(data.session);
      })
      .catch(() => {
        if (mounted && !authEventSeen)
          setError("Your sign-in could not be restored. Please sign in again.");
      })
      .finally(() => {
        if (mounted) {
          if (recoveringRef.current) {
            rememberPasswordRecovery(recoveryOwnerRef.current);
            clearRecoveryCallback();
          }
          setAuthLoading(false);
        }
      });
    const sub = AppState.addEventListener("change", (state) =>
      state === "active"
        ? supabase!.auth.startAutoRefresh()
        : supabase!.auth.stopAutoRefresh(),
    );
    const stopNative = startNativeAuthListener(
      (message) => {
        if (mounted) setError(message);
      },
      (next, pending) => {
        if (!mounted) return;
        startPasswordRecovery(next?.user.id ?? null, pending);
        if (next && !pending) acceptSession(next);
      },
    );
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      sub.remove();
      stopNative();
    };
  }, []);
  async function refresh() {
    const current = sessionRef.current;
    if (demoRef.current || !current || !supabase) return;
    const version = scope.current;
    const request = ++refreshCount.current;
    const tables = [
      "profiles",
      "goals",
      "completions",
      "events",
      "memories",
      "messages",
      "voice_sessions",
    ];
    const stale = () =>
      version !== scope.current ||
      request !== refreshCount.current ||
      demoRef.current;
    const results = await Promise.all(
      tables.map(async (table) => {
        if (table === "completions") {
          // Lifetime garden growth must not disappear when the usual REST row cap
          // is reached. UUID keyset pagination gives every page a stable boundary.
          const completions: Snapshot["completions"] = [];
          let after: string | undefined;
          while (true) {
            let query = supabase!
              .from(table)
              .select("id,goal_id,local_date", { count: "exact" })
              .eq("user_id", current.user.id)
              .order("id", { ascending: true })
              .limit(1000)
              .setHeader("Authorization", `Bearer ${current.access_token}`);
            if (after) query = query.gt("id", after);
            const page = await query;
            if (stale() || page.error) return page;
            const rows = page.data ?? [];
            completions.push(...rows);
            // Exact count also handles projects configured with a smaller REST cap.
            if (
              !rows.length ||
              (page.count !== null && rows.length >= page.count) ||
              (page.count === null && rows.length < 1000)
            )
              return { ...page, data: completions };
            after = rows[rows.length - 1]!.id;
          }
        }
        return supabase!
          .from(table)
          .select("*")
          .eq("user_id", current.user.id)
          .order("created_at", { ascending: false })
          .limit(
            table === "messages" ? 100 : table === "voice_sessions" ? 20 : 1000,
          )
          .setHeader("Authorization", `Bearer ${current.access_token}`);
      }),
    );
    // Discard both data and errors from requests belonging to a previous account.
    if (
      version !== scope.current ||
      request !== refreshCount.current ||
      demoRef.current
    )
      return;
    for (let i = 0; i < results.length; i++)
      if (results[i]!.error && !(i === 6 && missingTable(results[i]!.error)))
        throw results[i]!.error;
    setData(
      normalizeSnapshot({
        profile: results[0]!.data?.[0],
        goals: results[1]!.data ?? [],
        completions: results[2]!.data ?? [],
        events: results[3]!.data ?? [],
        memories: results[4]!.data ?? [],
        messages: (results[5]!.data ?? []).reverse(),
        voiceSessions: results[6]!.data ?? [],
      } as Partial<Snapshot>),
    );
  }
  useEffect(() => {
    if (!session || demo || passwordRecovery) {
      setDataLoading(false);
      return;
    }
    let active = true;
    setDataLoading(true);
    refresh()
      .catch((error) => {
        if (active)
          setError(error?.message ?? "Your information could not be loaded.");
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id, demo, passwordRecovery]);
  useEffect(() => {
    if (!demo || loading) return;
    const version = scope.current;
    AsyncStorage.setItem("kindred-demo", JSON.stringify(data)).catch(() => {
      if (version === scope.current && demoRef.current)
        setError("Could not save the local demo.");
    });
  }, [data, demo, loading]);
  async function run(fn: () => Promise<void>) {
    assertActiveScope();
    if (lock.current)
      throw new Error("Please wait for the current action to finish.");
    const operation = Symbol("companion-action");
    lock.current = operation;
    const version = scope.current;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (error) {
      const message =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "Something went wrong. Please try again.";
      if (version === scope.current) setError(message);
      throw new Error(message);
    } finally {
      if (lock.current === operation) {
        lock.current = null;
        setBusy(false);
      }
    }
  }
  async function write(
    table: string,
    op: "insert" | "update" | "delete" | "upsert",
    value: object,
    id?: string,
  ) {
    const current = assertActiveScope();
    if (!supabase || !current) throw new Error("Please sign in first.");
    let query;
    if (op === "insert")
      query = supabase
        .from(table)
        .insert({ ...value, user_id: current.user.id });
    else if (op === "upsert")
      query = supabase
        .from(table)
        .upsert({ ...value, user_id: current.user.id });
    else if (op === "update")
      query = supabase
        .from(table)
        .update(value)
        .eq("id", id!)
        .eq("user_id", current.user.id);
    else
      query = supabase
        .from(table)
        .delete()
        .eq("id", id!)
        .eq("user_id", current.user.id);
    const { error } = await query.setHeader(
      "Authorization",
      `Bearer ${current.access_token}`,
    );
    assertActiveScope();
    if (error) throw error;
    await refresh();
  }
  function completionGoal(id: string, requireActive = true) {
    const current = assertActiveScope();
    const goal = dataRef.current.goals.find((item) => item.id === id);
    if (
      !goal ||
      goal.user_id !== (demo ? "demo" : current?.user.id) ||
      (requireActive && goal.status !== "active")
    )
      throw new Error("Choose one of your active goals to record progress.");
    return goal;
  }
  async function recordCompletionNow(id: string) {
    const current = assertActiveScope();
    const goal = completionGoal(id);
    const snapshot = dataRef.current;
    const now = new Date();
    const date = localDate(now, snapshot.profile.timezone);
    // Repeated confirmation is a no-op; it never undoes a recorded effort.
    if (
      snapshot.completions.some(
        (item) => item.goal_id === id && item.local_date === date,
      )
    )
      return;
    const before = gardenPlants(
      [goal],
      snapshot.completions,
      snapshot.profile.timezone,
      now,
    )[0]!.completions;
    let completion = { id: uid(), goal_id: id, local_date: date };
    if (!demo) {
      const { data: inserted, error } = await supabase!
        .from("completions")
        .upsert(
          { ...completion, user_id: current!.user.id },
          { onConflict: "goal_id,local_date", ignoreDuplicates: true },
        )
        .select("id,goal_id,local_date")
        .setHeader("Authorization", `Bearer ${current!.access_token}`);
      assertActiveScope();
      if (error) throw error;
      if (!inserted?.length) {
        // Another device may already have saved this day. Load that fact without
        // manufacturing another win or incrementing the plant a second time.
        await refresh();
        return;
      }
      completion = inserted[0]!;
    }
    assertActiveScope();
    const updated = {
      ...dataRef.current,
      completions: [
        ...dataRef.current.completions.filter(
          (item) => !(item.goal_id === id && item.local_date === date),
        ),
        completion,
      ],
    };
    // Update the ref synchronously too: an old callback retained by a chat cannot
    // double-record a demo win while React is batching the next render.
    dataRef.current = updated;
    setData(updated);
    const after = gardenPlants(
      [goal],
      updated.completions,
      updated.profile.timezone,
      now,
    )[0]!.completions;
    setLatestGardenWin({
      id: uid(),
      goalId: goal.id,
      title: goal.title,
      before,
      after,
    });
    // The insert was confirmed and is already reflected locally. A later refresh
    // failure must not turn that saved accomplishment into a reported save failure.
    if (!demo) void refresh().catch(() => {});
  }
  const actions: Actions = {
    data,
    loading,
    authLoading: authLoading || nativeRecoveryPending,
    passwordRecovery,
    recoveryReady:
      passwordRecovery &&
      !authLoading &&
      !nativeRecoveryPending &&
      !!session &&
      recoveryOwner === session.user.id,
    finishPasswordRecovery,
    busy,
    demo,
    session,
    error,
    latestGardenWin,
    dismissGardenWin: () => {
      if (actionScope === scope.current) setLatestGardenWin(null);
    },
    recordCompletion: (id) => run(() => recordCompletionNow(id)),
    clearError: () => setError(""),
    enterDemo: () => {
      if (lock.current || demoRef.current) return;
      const version = ++scope.current;
      demoRef.current = true;
      setDemo(true);
      setData(emptySnapshot());
      setLatestGardenWin(null);
      setDemoLoading(true);
      setError("");
      AsyncStorage.getItem("kindred-demo")
        .then((raw) => {
          if (version === scope.current && demoRef.current)
            setData(raw ? normalizeSnapshot(JSON.parse(raw)) : emptySnapshot());
        })
        .catch(() => {
          if (version === scope.current && demoRef.current)
            setData(emptySnapshot());
        })
        .finally(() => {
          if (version === scope.current) setDemoLoading(false);
        });
    },
    signOut: () =>
      run(async () => {
        if (!demo) {
          const current = assertActiveScope()!;
          const token = await AsyncStorage.getItem("kindred-device-token");
          assertActiveScope();
          if (token) {
            const { error } = await supabase!
              .from("devices")
              .delete()
              .eq("user_id", current.user.id)
              .eq("token", token)
              .setHeader("Authorization", `Bearer ${current.access_token}`);
            assertActiveScope();
            if (error)
              throw new Error(
                "Could not disconnect this device. Please try signing out again.",
              );
            await AsyncStorage.removeItem("kindred-device-token");
            assertActiveScope();
          }
          const result = await supabase!.auth.signOut();
          if (result.error) throw result.error;
          sessionRef.current = null;
          setSession(null);
        }
        scope.current++;
        demoRef.current = false;
        setDemo(false);
        setDemoLoading(false);
        setDataLoading(Boolean(sessionRef.current));
        setData(emptySnapshot());
        setLatestGardenWin(null);
        setError("");
      }),
    refresh,
    saveProfile: (p) =>
      run(async () => {
        if (demo) setData((d) => ({ ...d, profile: p }));
        else await write("profiles", "upsert", p);
      }),
    savePlan: (input) =>
      run(async () => {
        const plan = normalizePlan(input);
        if (demo) {
          setData((d) => {
            const chosen = plan.goals.map((title) => {
              const existing = d.goals.find(
                (g) => g.title.trim().toLowerCase() === title.toLowerCase(),
              );
              return existing
                ? { ...existing, title, status: "active" as const }
                : {
                    id: uid(),
                    user_id: "demo",
                    title,
                    steps: [],
                    schedule: { kind: "daily" as const, days: [] },
                    status: "active" as const,
                    created_at: new Date().toISOString(),
                  };
            });
            const retained = new Set(chosen.map((g) => g.id));
            return {
              ...d,
              profile: {
                ...d.profile,
                display_name: d.profile.display_name || "friend",
                onboarded: true,
                checkin_time: plan.checkin_time,
                checkin_days: plan.checkin_days,
                timezone: plan.timezone,
              },
              goals: [
                ...chosen,
                ...d.goals
                  .filter((g) => !retained.has(g.id))
                  .map((g) => ({ ...g, status: "paused" as const })),
              ],
            };
          });
          return;
        }
        const current = assertActiveScope()!;
        const { error } = await supabase!
          .rpc("save_companion_plan", {
            p_goals: plan.goals,
            p_checkin_time: plan.checkin_time,
            p_checkin_days: plan.checkin_days,
            p_timezone: plan.timezone,
          })
          .setHeader("Authorization", `Bearer ${current.access_token}`);
        assertActiveScope();
        if (error) {
          if (error.code === "PGRST202")
            throw new Error(
              "The new plan setup is still being connected. Please try again shortly.",
            );
          throw error;
        }
        await refresh();
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
                source_message_id: source ?? null,
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
        assertActiveScope();
        setLatestGardenWin((win) => (win?.goalId === id ? null : win));
      }),
    toggleCompletion: (id) =>
      run(async () => {
        completionGoal(id, false);
        const date = localDate(new Date(), dataRef.current.profile.timezone);
        const done = dataRef.current.completions.find(
          (item) => item.goal_id === id && item.local_date === date,
        );
        if (!done) return recordCompletionNow(id);
        if (!demo) {
          const current = assertActiveScope()!;
          const { error } = await supabase!
            .from("completions")
            .delete()
            .eq("id", done.id)
            .eq("user_id", current.user.id)
            .setHeader("Authorization", `Bearer ${current.access_token}`);
          assertActiveScope();
          if (error) throw error;
        }
        const updated = {
          ...dataRef.current,
          completions: dataRef.current.completions.filter(
            (item) => item.id !== done.id,
          ),
        };
        dataRef.current = updated;
        setData(updated);
        if (!demo) void refresh().catch(() => {});
        setLatestGardenWin((win) => (win?.goalId === id ? null : win));
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
              {
                ...event,
                source_message_id: source ?? null,
                id: uid(),
                created_at: new Date().toISOString(),
              },
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
        if (demo) setData((d) => ({ ...d, messages: [], voiceSessions: [] }));
        else {
          const current = assertActiveScope()!;
          const { error } = await supabase!
            .from("messages")
            .delete()
            .eq("user_id", current.user.id)
            .setHeader("Authorization", `Bearer ${current.access_token}`);
          assertActiveScope();
          if (error) throw error;
          const voiceResult = await supabase!
            .from("voice_sessions")
            .delete()
            .eq("user_id", current.user.id)
            .setHeader("Authorization", `Bearer ${current.access_token}`);
          assertActiveScope();
          await refresh();
          if (voiceResult.error && !missingTable(voiceResult.error))
            throw voiceResult.error;
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
        const current = assertActiveScope()!;
        const { error } = await supabase!.functions.invoke("chat", {
          headers: { Authorization: `Bearer ${current.access_token}` },
          body: { text, request_id: uid() },
        });
        assertActiveScope();
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
