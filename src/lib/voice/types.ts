export type VoiceStatus =
  "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export type VoiceTranscript = {
  id: string;
  role: "user" | "assistant";
  content: string;
  final: boolean;
};
export type VoicePlan = {
  goals: string[];
  checkin_time: string;
  checkin_days: number[];
};
export type PendingVoicePlan = { id: string; plan: VoicePlan; summary: string };
export type VoiceSnapshot = {
  status: VoiceStatus;
  transcripts: VoiceTranscript[];
  muted: boolean;
  error: string | null;
  saveError: string | null;
  audioBlocked: boolean;
  pendingPlan: PendingVoicePlan | null;
  elapsedSeconds: number;
};
export type VoiceSessionCredential = {
  client_secret: string;
  expires_at: number;
  session_id: string;
  model: string;
  max_duration_seconds?: number;
};
export type SavedVoiceTurn = {
  role: "user" | "assistant";
  content: string;
  item_id?: string;
};
export type VoiceApi = {
  discard?: (sessionId: string) => void;
  start: (signal: AbortSignal) => Promise<VoiceSessionCredential>;
  finish: (sessionId: string, transcript: SavedVoiceTurn[]) => Promise<void>;
  exchangeSdp: (
    sdp: string,
    clientSecret: string,
    signal: AbortSignal,
  ) => Promise<string>;
};
// Small transport interfaces make the same lifecycle testable without microphone or API access.
export type VoiceTrack = { enabled: boolean; stop: () => void };
export type VoiceStream = {
  getTracks: () => VoiceTrack[];
  getAudioTracks: () => VoiceTrack[];
};
export type VoiceChannel = {
  readyState: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};
export type VoicePeer = {
  connectionState: string;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: { streams: VoiceStream[] }) => void) | null;
  addTrack: (track: VoiceTrack, stream: VoiceStream) => unknown;
  createDataChannel: (name: string) => VoiceChannel;
  createOffer: () => Promise<{ type?: string; sdp?: string }>;
  setLocalDescription: (description: {
    type?: string;
    sdp?: string;
  }) => Promise<void>;
  setRemoteDescription: (description: {
    type: string;
    sdp: string;
  }) => Promise<void>;
  close: () => void;
};
export type VoicePlayback = {
  attach: (stream: VoiceStream) => Promise<void>;
  resume: () => Promise<void>;
  dispose: () => void;
};
export type VoicePlatform = {
  supported: () => boolean;
  getMicrophone: () => Promise<VoiceStream>;
  createPeer: () => VoicePeer;
  createPlayback: () => VoicePlayback;
};
