import { isClearVoiceConfirmation, parseVoicePlan, planSummary } from "./plan";
import type {
  PendingVoicePlan,
  SavedVoiceTurn,
  VoiceApi,
  VoiceChannel,
  VoicePeer,
  VoicePlan,
  VoicePlatform,
  VoicePlayback,
  VoiceSnapshot,
  VoiceStream,
  VoiceTranscript,
} from "./types";

type Options = {
  platform: VoicePlatform;
  api: VoiceApi;
  onPlanConfirmed?: (plan: VoicePlan) => Promise<void>;
  onFinished?: () => void;
  id: () => string;
  connectTimeoutMs?: number;
};
const initialSnapshot = (): VoiceSnapshot => ({
  status: "idle",
  transcripts: [],
  muted: false,
  error: null,
  saveError: null,
  audioBlocked: false,
  pendingPlan: null,
  elapsedSeconds: 0,
});
export class RealtimeVoiceSession {
  private snapshot = initialSnapshot();
  private listeners = new Set<(snapshot: VoiceSnapshot) => void>();
  private generation = 0;
  private abort: AbortController | null = null;
  private stream: VoiceStream | null = null;
  private peer: VoicePeer | null = null;
  private channel: VoiceChannel | null = null;
  private playback: VoicePlayback | null = null;
  private sessionId: string | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setTimeout> | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private finalizedUsers = new Set<string>();
  private userSequence = 0;
  private startedUsers = new Map<string, number>();
  private responseInProgress = false;
  private responseQueued = false;
  private lastUser: { sequence: number; content: string } | null = null;
  private proposalAfterSequence = 0;
  private handledCalls = new Set<string>();
  private planSaving = false;
  private audioPlaying = false;
  private savedSessions = new Set<string>();
  constructor(private options: Options) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: (snapshot: VoiceSnapshot) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get supported() {
    return this.options.platform.supported();
  }
  get active() {
    return !["idle", "error"].includes(this.snapshot.status);
  }
  private emit(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
  private current(generation: number) {
    return generation === this.generation && !this.abort?.signal.aborted;
  }

  async start() {
    if (this.active) return;
    void this.end(false);
    const generation = ++this.generation;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.finalizedUsers.clear();
    this.startedUsers.clear();
    this.responseInProgress = false;
    this.responseQueued = false;
    this.handledCalls.clear();
    this.userSequence = 0;
    this.lastUser = null;
    this.proposalAfterSequence = 0;
    this.audioPlaying = false;
    this.planSaving = false;
    this.snapshot = initialSnapshot();
    this.emit({ status: "connecting" });
    if (!this.supported) {
      this.fail(
        "Voice needs a browser with microphone support. Open Kindred in a recent Safari, Chrome, or Edge browser.",
      );
      return;
    }
    this.connectionTimer = setTimeout(() => {
      if (this.current(generation))
        this.fail(
          "The voice connection took too long. Check your connection and try again.",
        );
    }, this.options.connectTimeoutMs ?? 30000);
    try {
      // Playback is prepared directly from the user's gesture, before async permission work.
      this.playback = this.options.platform.createPlayback();
      const stream = await this.options.platform.getMicrophone();
      if (!this.current(generation)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const credential = await this.options.api.start(signal);
      if (!this.current(generation)) return;
      if (!credential.client_secret || !credential.session_id)
        throw new Error("Voice isn’t ready yet. Please try again in a moment.");
      this.sessionId = credential.session_id;
      const peer = this.options.platform.createPeer();
      this.peer = peer;
      const playback = this.playback;
      peer.ontrack = (event) => {
        if (!this.current(generation) || !event.streams[0]) return;
        playback
          ?.attach(event.streams[0])
          .then(() => {
            if (this.current(generation)) this.emit({ audioBlocked: false });
          })
          .catch(() => {
            if (this.current(generation)) this.emit({ audioBlocked: true });
          });
      };
      peer.onconnectionstatechange = () => {
        if (!this.current(generation)) return;
        if (peer.connectionState === "failed")
          this.fail(
            "The voice connection dropped. Your microphone is off. You can try again.",
          );
        if (peer.connectionState === "disconnected" && !this.disconnectTimer)
          this.disconnectTimer = setTimeout(() => {
            if (
              this.current(generation) &&
              peer.connectionState === "disconnected"
            )
              this.fail(
                "The voice connection dropped. Your microphone is off. You can try again.",
              );
          }, 5000);
        if (peer.connectionState === "connected" && this.disconnectTimer) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = null;
        }
      };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.onmessage = (event) => {
        if (this.current(generation)) this.receive(event.data, generation);
      };
      channel.onerror = () => {
        if (this.current(generation))
          this.fail("The voice connection was interrupted. Please try again.");
      };
      channel.onclose = () => {
        if (this.current(generation) && this.active)
          this.fail("The conversation disconnected. Your microphone is off.");
      };
      channel.onopen = () => {
        if (!this.current(generation)) return;
        if (this.connectionTimer) clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
        this.emit({ status: "listening" });
        const started = Date.now();
        this.elapsedTimer = setInterval(() => {
          if (this.current(generation))
            this.emit({
              elapsedSeconds: Math.floor((Date.now() - started) / 1000),
            });
        }, 1000);
        this.durationTimer = setTimeout(
          () => {
            if (this.current(generation)) {
              const endedGeneration = this.generation + 1;
              void this.end().then(() => {
                if (this.generation === endedGeneration)
                  this.emit({
                    error:
                      "We’ve reached 20 minutes. You can start another conversation whenever you like.",
                  });
              });
            }
          },
          Math.min(credential.max_duration_seconds ?? 1200, 1200) * 1000,
        );
        this.requestResponse();
      };
      const offer = await peer.createOffer();
      if (!this.current(generation)) return;
      await peer.setLocalDescription(offer);
      if (!offer.sdp)
        throw new Error(
          "Your browser could not start audio. Please try again.",
        );
      const answer = await this.options.api.exchangeSdp(
        offer.sdp,
        credential.client_secret,
        signal,
      );
      if (!this.current(generation)) return;
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      if (!this.current(generation)) return;
      const name = (error as { name?: string })?.name;
      this.fail(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Microphone access is off. Allow microphone access in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect one and try again."
            : name === "NotReadableError"
              ? "Your microphone is busy. Close other apps using it and try again."
              : error instanceof Error
                ? error.message
                : "We couldn’t start the voice conversation. Please try again.",
      );
    }
  }
  private send(event: unknown) {
    if (this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(event));
  }
  private requestResponse() {
    if (this.responseInProgress) {
      this.responseQueued = true;
      return;
    }
    this.responseQueued = false;
    // Reserve immediately: response.created may arrive after another tool finishes.
    this.responseInProgress = true;
    this.send({ type: "response.create" });
  }
  private receive(raw: unknown, generation: number) {
    let event: Record<string, any>;
    try {
      event =
        typeof raw === "string"
          ? JSON.parse(raw)
          : (raw as Record<string, any>);
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string") return;
    const id = typeof event.item_id === "string" ? event.item_id : "";
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        if (id) {
          if (!this.startedUsers.has(id))
            this.startedUsers.set(id, ++this.userSequence);
          this.upsertTranscript({
            id,
            role: "user",
            content: "",
            final: false,
          });
        }
        this.audioPlaying = false;
        this.emit({ status: "listening" });
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit({ status: "thinking" });
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (
          !id ||
          typeof event.transcript !== "string" ||
          this.finalizedUsers.has(id)
        )
          break;
        this.finalizedUsers.add(id);
        // Transcription results can arrive out of order. An earlier "yes" must
        // never replace a more recent correction or refusal.
        const sequence = this.startedUsers.get(id) ?? 0;
        if (!this.lastUser || sequence >= this.lastUser.sequence)
          this.lastUser = { sequence, content: event.transcript };
        this.upsertTranscript({
          id,
          role: "user",
          content: event.transcript,
          final: true,
        });
        break;
      case "conversation.item.input_audio_transcription.failed":
        this.emit({
          error: "I couldn’t make out that sentence. Please say it again.",
        });
        break;
      case "response.created":
        this.responseInProgress = true;
        if (!this.audioPlaying) this.emit({ status: "thinking" });
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
      case "response.output_text.delta":
        if (id && typeof event.delta === "string") {
          const old = this.snapshot.transcripts.find((t) => t.id === id);
          this.upsertTranscript({
            id,
            role: "assistant",
            content: (old?.content ?? "") + event.delta,
            final: false,
          });
        }
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
      case "response.output_text.done": {
        const text = event.transcript ?? event.text;
        if (id && typeof text === "string")
          this.upsertTranscript({
            id,
            role: "assistant",
            content: text,
            final: true,
          });
        break;
      }
      case "output_audio_buffer.started":
        this.audioPlaying = true;
        this.emit({ status: "speaking" });
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.audioPlaying = false;
        this.emit({ status: "listening" });
        break;
      case "response.done":
        this.responseInProgress = false;
        if (event.response?.status === "failed") {
          this.fail(
            "Kindred couldn’t respond right now. Please try again in a moment.",
          );
          break;
        }
        if (!this.audioPlaying) this.emit({ status: "listening" });
        if (this.responseQueued) this.requestResponse();
        break;
      case "response.function_call_arguments.done":
        void this.handleTool(event, generation);
        break;
      case "error":
        this.fail(
          ["insufficient_quota", "rate_limit_exceeded"].includes(
            event.error?.code,
          )
            ? "Voice is temporarily unavailable because the AI service has reached its usage limit. Please try again later."
            : "Kindred’s voice connection had a problem. Your microphone is off. Please try again.",
        );
        break;
    }
  }
  private upsertTranscript(turn: VoiceTranscript) {
    const existing = this.snapshot.transcripts.findIndex(
      (t) => t.id === turn.id,
    );
    const transcripts = [...this.snapshot.transcripts];
    // Final transcript events can be duplicated; never regress a completed turn to a delta.
    if (existing >= 0) {
      if (transcripts[existing]!.final && !turn.final) return;
      transcripts[existing] = turn;
    } else transcripts.push(turn);
    this.emit({ transcripts: transcripts.slice(-160) });
  }
  private toolResult(callId: string, output: unknown) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.requestResponse();
  }
  private async handleTool(event: Record<string, any>, generation: number) {
    const callId = event.call_id;
    if (typeof callId !== "string" || this.handledCalls.has(callId)) return;
    this.handledCalls.add(callId);
    try {
      if (typeof event.arguments !== "string" || event.arguments.length > 10000)
        throw new Error("Please keep the plan short.");
      const args = JSON.parse(event.arguments);
      if (event.name === "propose_plan") {
        if (this.planSaving)
          throw new Error("A confirmed plan is still saving. Please wait.");
        const plan = parseVoicePlan(args);
        const proposal: PendingVoicePlan = {
          id: this.options.id(),
          plan,
          summary: planSummary(plan),
        };
        this.proposalAfterSequence = this.userSequence;
        this.emit({ pendingPlan: proposal });
        this.toolResult(callId, {
          proposal_id: proposal.id,
          summary: proposal.summary,
          requires_confirmation: true,
          instruction:
            "Read this plan back and ask for a clear yes before calling confirm_plan. Nothing has been saved.",
        });
      } else if (event.name === "confirm_plan") {
        const proposal = this.snapshot.pendingPlan;
        if (!proposal || args.proposal_id !== proposal.id)
          throw new Error(
            "That proposal is no longer current. Ask the user to describe the plan again.",
          );
        if (
          !(await this.waitForConfirmation(generation)) ||
          !this.lastUser ||
          this.lastUser.sequence !== this.userSequence ||
          this.lastUser.sequence <= this.proposalAfterSequence ||
          !isClearVoiceConfirmation(this.lastUser.content)
        )
          throw new Error(
            "The user has not clearly confirmed this plan after hearing it. Ask them to say yes to save it, or ask what they would change. Nothing was saved.",
          );
        await this.savePlan(proposal, generation);
        if (this.current(generation))
          this.toolResult(callId, { saved: true, summary: proposal.summary });
      } else
        this.toolResult(callId, {
          error:
            "That action is unavailable. You can help with goals and check-in preferences.",
        });
    } catch (error) {
      if (this.current(generation))
        this.toolResult(callId, {
          error:
            error instanceof Error
              ? error.message
              : "The plan could not be saved. Nothing changed.",
        });
    }
  }
  private async waitForConfirmation(generation: number): Promise<boolean> {
    const result = () =>
      this.lastUser &&
      this.lastUser.sequence === this.userSequence &&
      this.lastUser.sequence > this.proposalAfterSequence
        ? isClearVoiceConfirmation(this.lastUser.content)
        : null;
    const ready = result();
    if (ready !== null) return ready;
    // Transcription can lag behind the model's tool call. Only wait if a genuinely
    // new speech turn began after the proposal; late transcripts from earlier
    // speech never establish consent.
    if (this.userSequence <= this.proposalAfterSequence) return false;
    return new Promise((resolve) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (value: boolean) => {
        if (finished) return;
        finished = true;
        unsubscribe();
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", aborted);
        resolve(value);
      };
      const unsubscribe = this.subscribe(() => {
        if (!this.current(generation)) {
          done(false);
          return;
        }
        const value = result();
        if (value !== null) done(value);
      });
      const signal = this.abort?.signal;
      const aborted = () => done(false);
      signal?.addEventListener("abort", aborted, { once: true });
      timer = setTimeout(() => done(false), 4000);
    });
  }
  private async savePlan(proposal: PendingVoicePlan, generation: number) {
    if (
      !this.current(generation) ||
      this.snapshot.pendingPlan?.id !== proposal.id
    )
      throw new Error(
        "That plan has changed. Please confirm the current plan.",
      );
    if (this.planSaving) throw new Error("This plan is already being saved.");
    if (!this.options.onPlanConfirmed)
      throw new Error("Saving a plan isn’t available right now.");
    this.planSaving = true;
    try {
      await this.options.onPlanConfirmed(proposal.plan);
      if (
        this.current(generation) &&
        this.snapshot.pendingPlan?.id === proposal.id
      )
        this.emit({ pendingPlan: null, error: null });
    } finally {
      this.planSaving = false;
    }
  }
  async confirmPlan() {
    const proposal = this.snapshot.pendingPlan;
    if (!proposal || !this.active) return;
    const generation = this.generation;
    try {
      await this.savePlan(proposal, generation);
      if (this.current(generation)) {
        this.send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `I confirmed the plan using the Save button. It saved successfully: ${proposal.summary}`,
              },
            ],
          },
        });
        this.requestResponse();
      }
    } catch (error) {
      if (this.current(generation))
        this.emit({
          error:
            error instanceof Error
              ? error.message
              : "The plan could not be saved. Please try again.",
        });
    }
  }
  dismissPlan() {
    this.emit({ pendingPlan: null });
  }
  toggleMute() {
    if (!this.stream || !this.active) return;
    const muted = !this.snapshot.muted;
    this.stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.emit({ muted });
  }
  async resumeAudio() {
    try {
      await this.playback?.resume();
      this.emit({ audioBlocked: false });
    } catch {
      this.emit({
        audioBlocked: true,
        error:
          "Audio playback is blocked. Check this browser’s sound permissions, then try again.",
      });
    }
  }
  clearError() {
    this.emit({
      error: null,
      saveError: null,
      ...(this.snapshot.status === "error" ? { status: "idle" as const } : {}),
    });
  }
  reset() {
    // Sign-out clears visible conversation details as well as stopping audio.
    void this.end(false);
    this.snapshot = initialSnapshot();
    this.emit({});
  }
  private cleanup() {
    this.abort?.abort();
    this.abort = null;
    for (const timer of [
      this.connectionTimer,
      this.durationTimer,
      this.disconnectTimer,
    ])
      if (timer) clearTimeout(timer);
    this.connectionTimer = null;
    this.durationTimer = null;
    this.disconnectTimer = null;
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);
    this.elapsedTimer = null;
    if (this.channel) {
      this.channel.onopen = null;
      this.channel.onmessage = null;
      this.channel.onerror = null;
      this.channel.onclose = null;
      try {
        this.channel.close();
      } catch {}
    }
    this.channel = null;
    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onconnectionstatechange = null;
      try {
        this.peer.close();
      } catch {}
    }
    this.peer = null;
    this.stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    this.stream = null;
    this.playback?.dispose();
    this.playback = null;
  }
  private savedTranscript(): SavedVoiceTurn[] {
    let total = 0;
    const kept: SavedVoiceTurn[] = [];
    for (const turn of this.snapshot.transcripts
      .filter((t) => t.final && t.content.trim())
      .slice(-120)) {
      const next: SavedVoiceTurn = {
        role: turn.role,
        content: turn.content.trim().slice(0, 2000),
        item_id: turn.id,
      };
      if (
        total + next.content.length > 30000 ||
        new TextEncoder().encode(JSON.stringify([...kept, next])).length > 60000
      )
        break;
      kept.push(next);
      total += next.content.length;
    }
    return kept;
  }
  private async persist(
    sessionId: string | null,
    transcript: SavedVoiceTurn[],
    generation: number,
  ) {
    if (!sessionId || this.savedSessions.has(sessionId)) return;
    this.savedSessions.add(sessionId);
    try {
      await this.options.api.finish(sessionId, transcript);
      this.options.onFinished?.();
    } catch {
      if (generation === this.generation)
        this.emit({
          saveError:
            "Your conversation ended, but its transcript could not be saved. Your confirmed goals and plan are still saved separately.",
        });
    }
  }
  private fail(message: string) {
    const sessionId = this.sessionId;
    const transcript = this.savedTranscript();
    this.sessionId = null;
    this.generation++;
    this.cleanup();
    this.emit({
      status: "error",
      error: message,
      muted: false,
      pendingPlan: null,
      audioBlocked: false,
    });
    void this.persist(sessionId, transcript, this.generation);
  }
  async end(save = true) {
    const sessionId = this.sessionId;
    const transcript = this.savedTranscript();
    this.sessionId = null;
    this.generation++;
    this.cleanup();
    this.emit({
      status: "idle",
      muted: false,
      pendingPlan: null,
      audioBlocked: false,
    });
    if (save) await this.persist(sessionId, transcript, this.generation);
    else if (sessionId) this.options.api.discard?.(sessionId);
  }
}
