import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Circle,
  Ellipse,
} from "react-native-svg";
import { AudioLines } from "lucide-react-native";
import { colors } from "./ui";
export function VoiceOrb({
  active = false,
  speaking = false,
  muted = false,
}: {
  active?: boolean;
  speaking?: boolean;
  muted?: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!active || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: speaking ? 900 : 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: speaking ? 900 : 1800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, speaking, reduceMotion, pulse]);
  return (
    <View accessible={false} style={styles.outer}>
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 0.7],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, speaking ? 1.035 : 1.015],
              }),
            },
          ],
        }}
      >
        <Svg width={212} height={212} viewBox="0 0 212 212">
          <Defs>
            <RadialGradient id="kindred-orb" cx="30%" cy="24%" r="85%">
              <Stop offset="0" stopColor="#E1EBCF" />
              <Stop offset=".45" stopColor="#A4BDA3" />
              <Stop offset="1" stopColor="#406852" />
            </RadialGradient>
            <RadialGradient id="kindred-glow" cx="70%" cy="80%" r="70%">
              <Stop offset="0" stopColor="#EECDB0" stopOpacity=".8" />
              <Stop offset="1" stopColor="#D2DCC9" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="106" cy="106" r="101" fill="url(#kindred-orb)" />
          <Circle cx="106" cy="106" r="101" fill="url(#kindred-glow)" />
          <Ellipse
            cx="87"
            cy="51"
            rx="48"
            ry="23"
            fill="#FFFFFF"
            opacity=".09"
          />
          <Circle
            cx="106"
            cy="106"
            r="100"
            stroke="#FFFFFF"
            strokeOpacity=".3"
            fill="none"
          />
        </Svg>
        <View style={styles.symbol}>
          <AudioLines
            size={48}
            strokeWidth={1.3}
            color={muted ? "#E7EBE3" : "#FFFFFF"}
          />
        </View>
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  outer: {
    width: 248,
    height: 248,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 242,
    height: 242,
    borderRadius: 121,
    backgroundColor: colors.sage,
  },
  symbol: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
