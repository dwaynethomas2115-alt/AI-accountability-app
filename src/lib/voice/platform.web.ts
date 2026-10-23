import type { VoicePeer, VoicePlatform, VoiceStream } from "./types";

export const voicePlatform: VoicePlatform = {
  supported: () =>
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.RTCPeerConnection === "function" &&
    typeof navigator.mediaDevices?.getUserMedia === "function",
  getMicrophone: async () =>
    (await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })) as unknown as VoiceStream,
  createPeer: () => new RTCPeerConnection() as unknown as VoicePeer,
  createPlayback: () => {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);
    let disposed = false;
    return {
      attach: async (stream) => {
        if (disposed) return;
        audio.srcObject = stream as unknown as MediaStream;
        await audio.play();
      },
      resume: async () => {
        if (!disposed) await audio.play();
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      },
    };
  },
};
