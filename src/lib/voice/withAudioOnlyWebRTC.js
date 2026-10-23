const { AndroidConfig, withInfoPlist } = require("expo/config-plugins");

// The upstream WebRTC plugin enables video permissions even for audio-only apps.
// Register before it: Expo executes these Info.plist mods in reverse order.
// Kindred should ask only for the microphone it actually uses.
module.exports = function withAudioOnlyWebRTC(config) {
  config = withInfoPlist(config, (next) => {
    delete next.modResults.NSCameraUsageDescription;
    return next;
  });
  return AndroidConfig.Permissions.withBlockedPermissions(config, [
    "android.permission.CAMERA",
  ]);
};
