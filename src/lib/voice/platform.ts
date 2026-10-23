// Metro selects platform.web.ts for the website. Native WebRTC requires an Expo development build.
import { NativeModules } from "react-native";
import type { VoicePeer, VoicePlatform, VoiceStream } from "./types";
function rtc(): typeof import("react-native-webrtc") {
  if (!NativeModules.WebRTCModule) {
    throw new Error(
      "Voice needs the Kindred development build on this phone. You can also open the website in Safari or Chrome.",
    );
  }
  return require("react-native-webrtc");
}
export const voicePlatform: VoicePlatform = {
  supported: () => Boolean(NativeModules.WebRTCModule),
  getMicrophone: async () =>
    (await rtc().mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })) as unknown as VoiceStream,
  createPeer: () => new (rtc().RTCPeerConnection)({}) as unknown as VoicePeer,
  // Native WebRTC renders incoming audio through the device audio session itself.
  createPlayback: () => ({
    attach: async () => {},
    resume: async () => {},
    dispose: () => {},
  }),
};
