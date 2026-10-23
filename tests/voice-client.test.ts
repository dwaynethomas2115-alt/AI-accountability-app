import { test } from "node:test";
import assert from "node:assert/strict";
import { RealtimeVoiceSession } from "../src/lib/voice/session.ts";
import {
  isClearVoiceConfirmation,
  parseVoicePlan,
} from "../src/lib/voice/plan.ts";
import type {
  VoiceApi,
  VoiceChannel,
  VoicePeer,
  VoicePlan,
  VoicePlatform,
  VoiceStream,
  SavedVoiceTurn,
} from "../src/lib/voice/types.ts";

const plan: VoicePlan = {
  goals: ["Walk each day"],
  checkin_time: "18:00",
  checkin_days: [1, 3, 5],
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness(
  overrides: Partial<VoicePlatform> = {},
  connectTimeoutMs = 5000,
) {
  let stopped = 0,
    disposed = 0,
    apiStarts = 0,
    peerClosed = 0,
    channelClosed = 0,
    attached = 0;
  const sent: Record<string, any>[] = [];
  const saved: VoicePlan[] = [];
  const finishes: { id: string; transcript: SavedVoiceTurn[] }[] = [];
  const track = {
    enabled: true,
    stop: () => {
      stopped++;
    },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel: VoiceChannel = {
    readyState: "connecting",
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (raw) => sent.push(JSON.parse(raw)),
    close: () => {
      channelClosed++;
      channel.readyState = "closed";
    },
  };
  const peer: VoicePeer = {
    connectionState: "new",
    onconnectionstatechange: null,
    ontrack: null,
    addTrack: () => {},
    createDataChannel: () => channel,
    createOffer: async () => ({ type: "offer", sdp: "v=0\r\noffer" }),
    setLocalDescription: async () => {},
    setRemoteDescription: async () => {
      peer.connectionState = "connected";
      channel.readyState = "open";
      channel.onopen?.();
    },
    close: () => {
      peerClosed++;
    },
  };
  const platform: VoicePlatform = {
    supported: () => true,
    getMicrophone: async () => stream,
    createPeer: () => peer,
    createPlayback: () => ({
      attach: async () => {
        attached++;
      },
      resume: async () => {},
      dispose: () => {
        disposed++;
      },
    }),
    ...overrides,
  };
  const api: VoiceApi = {
    start: async () => {
      apiStarts++;
      return {
        client_secret: "ephemeral-test-value",
        expires_at: Date.now() / 1000 + 60,
        session_id: "session-one",
        model: "gpt-realtime",
        max_duration_seconds: 1200,
      };
    },
    finish: async (id, transcript) => {
      finishes.push({ id, transcript });
    },
    exchangeSdp: async (sdp, credential) => {
      assert.ok(sdp.startsWith("v=0"));
      assert.equal(credential, "ephemeral-test-value");
      return "v=0\r\nanswer";
    },
  };
  let id = 0;
  const session = new RealtimeVoiceSession({
    platform,
    api,
    id: () => `proposal-${++id}`,
    connectTimeoutMs,
    onPlanConfirmed: async (value) => {
      saved.push(value);
    },
  });
  const emit = (event: Record<string, unknown>) =>
    channel.onmessage?.({ data: JSON.stringify(event) });
  const tool = (name: string, args: unknown, callId = crypto.randomUUID()) => {
    emit({
      type: "response.function_call_arguments.done",
      name,
      arguments: JSON.stringify(args),
      call_id: callId,
    });
    return callId;
  };
  return {
    session,
    emit,
    tool,
    peer,
    channel,
    stream,
    track,
    sent,
    saved,
    finishes,
    api,
    counts: () => ({
      stopped,
      disposed,
      apiStarts,
      peerClosed,
      channelClosed,
      attached,
    }),
  };
}

test("voice starts real transport, renders turns, mutes and fully cleans up on end", async () => {
  const h = harness();
  await h.session.start();
  assert.equal(h.session.getSnapshot().status, "listening");
  assert.equal(h.counts().apiStarts, 1);
  h.peer.ontrack?.({ streams: [h.stream] });
  await tick();
  assert.equal(h.counts().attached, 1);
  h.emit({ type: "input_audio_buffer.speech_started", item_id: "user1" });
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "user1",
    transcript: "I went for a walk.",
  });
  h.emit({ type: "output_audio_buffer.started" });
  assert.equal(h.session.getSnapshot().status, "speaking");
  h.emit({
    type: "response.output_audio_transcript.done",
    item_id: "assistant1",
    transcript: "How did that feel?",
  });
  h.session.toggleMute();
  assert.equal(h.track.enabled, false);
  assert.equal(h.session.getSnapshot().muted, true);
  h.session.toggleMute();
  assert.equal(h.track.enabled, true);
  await h.session.end();
  assert.equal(h.session.active, false);
  assert.deepEqual(h.counts(), {
    stopped: 1,
    disposed: 1,
    apiStarts: 1,
    peerClosed: 1,
    channelClosed: 1,
    attached: 1,
  });
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0]!.transcript.length, 2);
  await h.session.end();
  assert.equal(h.finishes.length, 1);
});

test("microphone denial surfaces a useful error and never requests a voice credential", async () => {
  const h = harness({
    getMicrophone: async () => {
      throw new DOMException("Denied", "NotAllowedError");
    },
  });
  await h.session.start();
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().error!, /Microphone access is off/);
  assert.equal(h.counts().apiStarts, 0);
  assert.equal(h.counts().disposed, 1);
});

test("cancel during permission prompt stops a late microphone and never connects", async () => {
  const late = deferred<VoiceStream>();
  const h = harness({ getMicrophone: () => late.promise });
  const start = h.session.start();
  await h.session.end();
  late.resolve(h.stream);
  await start;
  assert.equal(h.counts().stopped, 1);
  assert.equal(h.counts().apiStarts, 0);
  assert.equal(h.session.getSnapshot().status, "idle");
});

test("connection timeout releases playback and a late microphone", async () => {
  const late = deferred<VoiceStream>();
  const h = harness({ getMicrophone: () => late.promise }, 15);
  const start = h.session.start();
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().error!, /took too long/);
  late.resolve(h.stream);
  await start;
  assert.equal(h.counts().stopped, 1);
  assert.equal(h.counts().disposed, 1);
});

test("failed peer connection stops the microphone and records history at most once", async () => {
  const h = harness();
  await h.session.start();
  h.peer.connectionState = "failed";
  h.peer.onconnectionstatechange?.();
  await tick();
  assert.equal(h.session.getSnapshot().status, "error");
  assert.equal(h.counts().stopped, 1);
  assert.equal(h.finishes.length, 1);
  await h.session.end();
  assert.equal(h.finishes.length, 1);
});

test("a model cannot confirm its own plan or reuse a late pre-proposal yes", async () => {
  const h = harness();
  await h.session.start();
  h.emit({ type: "input_audio_buffer.speech_started", item_id: "old-yes" });
  h.tool("propose_plan", plan);
  await tick();
  const pending = h.session.getSnapshot().pendingPlan!;
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "old-yes",
    transcript: "Yes.",
  });
  h.tool("confirm_plan", { proposal_id: pending.id });
  await tick();
  assert.equal(h.saved.length, 0);
  assert.ok(
    h.sent.some((e) => e.item?.output?.includes("not clearly confirmed")),
  );
  await h.session.end();
});

test("spoken confirmation waits for a new turn transcription and saves exactly once", async () => {
  const h = harness();
  await h.session.start();
  h.tool("propose_plan", plan);
  await tick();
  const pending = h.session.getSnapshot().pendingPlan!;
  h.emit({ type: "input_audio_buffer.speech_started", item_id: "new-yes" });
  const call = h.tool("confirm_plan", { proposal_id: pending.id });
  await tick();
  assert.equal(h.saved.length, 0);
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "new-yes",
    transcript: "Yes, save it.",
  });
  await tick();
  assert.equal(h.saved.length, 1);
  assert.equal(h.session.getSnapshot().pendingPlan, null);
  h.tool("confirm_plan", { proposal_id: pending.id }, call);
  await tick();
  assert.equal(h.saved.length, 1);
  await h.session.end();
});

test("conditional yes is not consent; visible confirmation remains an explicit alternative", async () => {
  assert.equal(isClearVoiceConfirmation("Yes, but change it to 7"), false);
  assert.equal(isClearVoiceConfirmation("no, don't save it"), false);
  assert.equal(isClearVoiceConfirmation("Yes please!"), true);
  assert.throws(() => parseVoicePlan({ ...plan, checkin_days: [] }));
  const h = harness();
  await h.session.start();
  h.tool("propose_plan", plan);
  await tick();
  await h.session.confirmPlan();
  assert.equal(h.saved.length, 1);
  await h.session.end();
});

test("tool output waits for the current response to finish before requesting another", async () => {
  const h = harness();
  await h.session.start();
  assert.equal(h.sent.filter((e) => e.type === "response.create").length, 1);
  h.tool("propose_plan", plan);
  await tick();
  assert.equal(h.sent.filter((e) => e.type === "response.create").length, 1);
  h.emit({ type: "response.done", response: { status: "completed" } });
  assert.equal(h.sent.filter((e) => e.type === "response.create").length, 2);
  await h.session.end();
});

test("transcript history obeys the backend UTF-8 budget and saving failure stays visible", async () => {
  const h = harness();
  h.api.finish = async (_id, transcript) => {
    assert.ok(
      new TextEncoder().encode(JSON.stringify(transcript)).length <= 60000,
    );
    throw new Error("offline");
  };
  await h.session.start();
  for (let i = 0; i < 30; i++)
    h.emit({
      type: "response.output_audio_transcript.done",
      item_id: `a${i}`,
      transcript: "你".repeat(2000),
    });
  await h.session.end();
  assert.match(
    h.session.getSnapshot().saveError!,
    /transcript could not be saved/,
  );
  assert.equal(h.session.active, false);
});

test("autoplay denial keeps the call recoverable through an explicit audio gesture", async () => {
  let resumed = false;
  const h = harness({
    createPlayback: () => ({
      attach: async () => {
        throw new DOMException("Autoplay blocked", "NotAllowedError");
      },
      resume: async () => {
        resumed = true;
      },
      dispose: () => {},
    }),
  });
  await h.session.start();
  h.peer.ontrack?.({ streams: [h.stream] });
  await tick();
  assert.equal(h.session.getSnapshot().audioBlocked, true);
  assert.equal(h.session.active, true);
  await h.session.resumeAudio();
  assert.equal(resumed, true);
  assert.equal(h.session.getSnapshot().audioBlocked, false);
  await h.session.end();
});

test("repeated Start taps request the microphone and credential only once", async () => {
  let prompts = 0;
  const late = deferred<VoiceStream>();
  const h = harness({
    getMicrophone: () => {
      prompts++;
      return late.promise;
    },
  });
  const first = h.session.start();
  await h.session.start();
  assert.equal(prompts, 1);
  late.resolve(h.stream);
  await first;
  assert.equal(h.counts().apiStarts, 1);
  await h.session.end();
});

test("credential failure turns microphone off and keeps provider internals out of normal flow", async () => {
  const h = harness();
  h.api.start = async () => {
    throw new Error(
      "Voice is temporarily unavailable. Please try again shortly.",
    );
  };
  await h.session.start();
  assert.equal(h.session.getSnapshot().status, "error");
  assert.equal(h.counts().stopped, 1);
  assert.equal(h.counts().disposed, 1);
  assert.equal(h.peer.connectionState, "new");
});

test("sign-out reset stops the microphone and forgets the previous user's visible transcript", async () => {
  const h = harness();
  const discarded: string[] = [];
  h.api.discard = (id) => {
    discarded.push(id);
  };
  await h.session.start();
  h.emit({ type: "input_audio_buffer.speech_started", item_id: "private" });
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "private",
    transcript: "A personal goal.",
  });
  h.session.reset();
  assert.deepEqual(discarded, ["session-one"]);
  assert.equal(h.counts().stopped, 1);
  assert.equal(h.finishes.length, 0);
  assert.equal(h.session.getSnapshot().transcripts.length, 0);
  assert.equal(h.session.getSnapshot().status, "idle");
});

test("an out-of-order yes cannot overwrite a more recent refusal", async () => {
  const h = harness();
  await h.session.start();
  h.tool("propose_plan", plan);
  const proposal = h.session.getSnapshot().pendingPlan!;
  h.emit({ type: "input_audio_buffer.speech_started", item_id: "yes" });
  h.emit({
    type: "input_audio_buffer.speech_started",
    item_id: "changed-mind",
  });
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "changed-mind",
    transcript: "Wait, no, make it later.",
  });
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "yes",
    transcript: "Yes, save it.",
  });
  h.tool("confirm_plan", { proposal_id: proposal.id });
  await tick();
  assert.equal(h.saved.length, 0);
  await h.session.end();
});

test("replacing a proposal while confirmation is pending never saves the old plan", async () => {
  const h = harness();
  await h.session.start();
  h.tool("propose_plan", plan);
  const original = h.session.getSnapshot().pendingPlan!;
  h.emit({ type: "input_audio_buffer.speech_started", item_id: "yes" });
  h.tool("confirm_plan", { proposal_id: original.id });
  h.emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "yes",
    transcript: "Yes, save that.",
  });
  h.tool("propose_plan", { ...plan, checkin_time: "20:00" });
  await tick();
  assert.equal(h.saved.length, 0);
  assert.equal(h.session.getSnapshot().pendingPlan!.plan.checkin_time, "20:00");
  await h.session.end();
});
